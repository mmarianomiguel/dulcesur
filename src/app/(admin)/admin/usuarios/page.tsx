"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Users,
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  Shield,
} from "lucide-react";

interface Usuario {
  id: string;
  nombre: string;
  email: string | null;
  auth_id: string | null;
  rol_id: string | null;
  es_admin: boolean;
  activo: boolean;
  created_at: string;
  roles?: { nombre: string } | null;
}

interface Rol {
  id: string;
  nombre: string;
}

const emptyForm = {
  nombre: "",
  email: "",
  password: "",
  rol_id: "",
  es_admin: false,
};

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("usuarios")
      .select("*, roles(nombre)")
      .order("nombre");
    setUsuarios(data || []);
    setLoading(false);
  }, []);

  const fetchRoles = useCallback(async () => {
    const { data } = await supabase.from("roles").select("id, nombre").order("nombre");
    setRoles(data || []);
  }, []);

  useEffect(() => {
    fetchUsuarios();
    fetchRoles();
  }, [fetchUsuarios, fetchRoles]);

  const filtered = usuarios.filter(
    (u) =>
      u.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (u: Usuario) => {
    setEditingUser(u);
    setForm({
      nombre: u.nombre,
      email: u.email || "",
      password: "",
      rol_id: u.rol_id || "",
      es_admin: u.es_admin,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingUser) {
        // Update existing user
        const updates: Record<string, unknown> = {
          nombre: form.nombre,
          email: form.email,
          rol_id: form.rol_id || null,
          es_admin: form.es_admin,
        };
        await supabase.from("usuarios").update(updates).eq("id", editingUser.id);
      } else {
        // Create new user via API
        const res = await fetch("/api/usuarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre: form.nombre,
            email: form.email,
            password: form.password,
            rol_id: form.rol_id || null,
            es_admin: form.es_admin,
          }),
        });
        const result = await res.json();
        if (!res.ok) {
          alert(result.error || "Error al crear usuario");
          setSaving(false);
          return;
        }
      }
      setDialogOpen(false);
      fetchUsuarios();
    } catch {
      alert("Error al guardar");
    }
    setSaving(false);
  };

  const handleDeactivate = async (u: Usuario) => {
    if (!confirm(`Desactivar a "${u.nombre}"?`)) return;
    const res = await fetch(
      `/api/usuarios?id=${u.id}&auth_id=${u.auth_id || ""}`,
      { method: "DELETE" }
    );
    if (res.ok) fetchUsuarios();
  };

  const handleToggleActive = async (u: Usuario) => {
    await supabase.from("usuarios").update({ activo: !u.activo }).eq("id", u.id);
    fetchUsuarios();
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Usuarios</h1>
            <p className="text-sm text-muted-foreground">
              Gestionar usuarios del sistema
            </p>
          </div>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Usuario
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
              Buscar
            </Label>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              No se encontraron usuarios
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
                      Email
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                      Rol
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                      Estado
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                      Admin
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium">{u.nombre}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {u.email || "-"}
                      </td>
                      <td className="py-3 px-4">
                        {u.roles?.nombre ? (
                          <Badge variant="secondary">{u.roles.nombre}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button onClick={() => handleToggleActive(u)}>
                          <Badge
                            variant={u.activo ? "default" : "outline"}
                            className={
                              u.activo
                                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 cursor-pointer"
                                : "text-muted-foreground cursor-pointer"
                            }
                          >
                            {u.activo ? "Activo" : "Inactivo"}
                          </Badge>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {u.es_admin && (
                          <Shield className="w-4 h-4 text-amber-500 inline-block" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(u)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeactivate(u)}
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

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Editar Usuario" : "Nuevo Usuario"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Nombre completo"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="correo@ejemplo.com"
              />
            </div>
            {!editingUser && (
              <div className="space-y-2">
                <Label>Contraseña</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select
                value={form.rol_id}
                onValueChange={(v) => setForm({ ...form, rol_id: v ?? "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="font-medium">Administrador</Label>
                <p className="text-xs text-muted-foreground">
                  Acceso total al sistema
                </p>
              </div>
              <Switch
                checked={form.es_admin}
                onCheckedChange={(v) => setForm({ ...form, es_admin: v })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving || !form.nombre || !form.email}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingUser ? "Guardar" : "Crear Usuario"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
