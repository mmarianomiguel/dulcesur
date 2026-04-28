"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
  Shield,
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  Key,
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
  { modulo: "Clientes", submodulos: ["Listado"] },
  {
    modulo: "Productos",
    submodulos: ["Listado", "Editar Precios", "Descuentos", "Marcas", "Lista de Precios (PDF)"],
  },
  { modulo: "Proveedores", submodulos: [] },
  { modulo: "Compras", submodulos: ["Registrar", "Pedidos", "Reposicion"] },
  { modulo: "Caja", submodulos: [] },
  { modulo: "Stock", submodulos: ["Ajustes de Stock", "Autoconsumo"] },
  {
    modulo: "Reportes",
    submodulos: ["General", "Resumen Mensual", "Ranking Clientes", "Resumen por Vendedor", "Percepciones"],
  },
  { modulo: "Vendedores", submodulos: [] },
  { modulo: "Auditoría", submodulos: [] },
  { modulo: "Tienda Online", submodulos: [] },
  {
    modulo: "Configuración",
    submodulos: ["General", "Apariencia", "Tienda Online", "Página de Inicio", "Pagos", "Usuarios y Roles", "Sistema"],
  },
];

const emptyUserForm = { nombre: "", email: "", password: "", rol_id: "", es_admin: false };
const emptyRolForm = { nombre: "", descripcion: "" };

export default function UsuariosRolesPage() {
  // ─── Usuarios state ───
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [userForm, setUserForm] = useState(emptyUserForm);

  // ─── Roles state ───
  const [rolDialogOpen, setRolDialogOpen] = useState(false);
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [editingRol, setEditingRol] = useState<Rol | null>(null);
  const [permRol, setPermRol] = useState<Rol | null>(null);
  const [rolForm, setRolForm] = useState(emptyRolForm);
  const [permisos, setPermisos] = useState<Record<string, boolean>>({});
  const [savingPerms, setSavingPerms] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: usrs }, { data: rls }] = await Promise.all([
      supabase.from("usuarios").select("*, roles(nombre)").order("nombre"),
      supabase.from("roles").select("*").order("nombre"),
    ]);
    setUsuarios(usrs || []);
    setRoles(rls || []);

    // User counts per role
    const counts: Record<string, number> = {};
    (usrs || []).filter((u: Usuario) => u.activo).forEach((u: Usuario) => {
      if (u.rol_id) counts[u.rol_id] = (counts[u.rol_id] || 0) + 1;
    });
    setUserCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Usuario handlers ───
  const filtered = usuarios.filter(
    (u) => norm(u.nombre).includes(norm(search)) || norm(u.email || "").includes(norm(search))
  );

  const openNewUser = () => { setEditingUser(null); setUserForm(emptyUserForm); setUserDialogOpen(true); };
  const openEditUser = (u: Usuario) => {
    setEditingUser(u);
    setUserForm({ nombre: u.nombre, email: u.email || "", password: "", rol_id: u.rol_id || "", es_admin: u.es_admin });
    setUserDialogOpen(true);
  };

  const handleSaveUser = async () => {
    setSaving(true);
    try {
      if (editingUser) {
        await supabase.from("usuarios").update({
          nombre: userForm.nombre, email: userForm.email, rol_id: userForm.rol_id || null, es_admin: userForm.es_admin,
        }).eq("id", editingUser.id);
      } else {
        const res = await fetch("/api/usuarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: userForm.nombre, email: userForm.email, password: userForm.password, rol_id: userForm.rol_id || null, es_admin: userForm.es_admin }),
        });
        const result = await res.json();
        if (!res.ok) { showAdminToast(result.error || "Error al crear usuario", "error"); setSaving(false); return; }
      }
      setUserDialogOpen(false);
      fetchData();
    } catch { showAdminToast("Error al guardar", "error"); }
    setSaving(false);
  };

  const handleDeactivateUser = (u: Usuario) => {
    setConfirmDialog({
      open: true, title: "Desactivar usuario", message: `Desactivar a "${u.nombre}"?`,
      onConfirm: async () => {
        const res = await fetch(`/api/usuarios?id=${u.id}&auth_id=${u.auth_id || ""}`, { method: "DELETE" });
        if (res.ok) fetchData();
      },
    });
  };

  const handleToggleActive = async (u: Usuario) => {
    await supabase.from("usuarios").update({ activo: !u.activo }).eq("id", u.id);
    fetchData();
  };

  // ─── Roles handlers ───
  const openNewRol = () => { setEditingRol(null); setRolForm(emptyRolForm); setRolDialogOpen(true); };
  const openEditRol = (r: Rol) => { setEditingRol(r); setRolForm({ nombre: r.nombre, descripcion: r.descripcion || "" }); setRolDialogOpen(true); };

  const handleSaveRol = async () => {
    setSaving(true);
    if (editingRol) {
      await supabase.from("roles").update({ nombre: rolForm.nombre, descripcion: rolForm.descripcion || null }).eq("id", editingRol.id);
    } else {
      await supabase.from("roles").insert({ nombre: rolForm.nombre, descripcion: rolForm.descripcion || null });
    }
    setRolDialogOpen(false);
    setSaving(false);
    fetchData();
  };

  const handleDeleteRol = (r: Rol) => {
    setConfirmDialog({
      open: true, title: "Eliminar rol", message: `Eliminar el rol "${r.nombre}"? Se eliminarán sus permisos asociados.`,
      onConfirm: async () => {
        await supabase.from("permisos").delete().eq("rol_id", r.id);
        await supabase.from("roles").delete().eq("id", r.id);
        fetchData();
      },
    });
  };

  const openPermissions = async (r: Rol) => {
    setPermRol(r);
    const { data } = await supabase.from("permisos").select("*").eq("rol_id", r.id);
    const permMap: Record<string, boolean> = {};
    MODULE_STRUCTURE.forEach((m) => {
      if (m.submodulos.length === 0) { permMap[`${m.modulo}::`] = false; }
      else { m.submodulos.forEach((s) => { permMap[`${m.modulo}::${s}`] = false; }); }
    });
    (data || []).forEach((p: Permiso) => { permMap[`${p.modulo}::${p.submodulo}`] = p.habilitado; });
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
    if (mod.submodulos.length === 0) { newPermisos[`${modulo}::`] = !newPermisos[`${modulo}::`]; }
    else {
      const allEnabled = isModuleEnabled(modulo);
      mod.submodulos.forEach((s) => { newPermisos[`${modulo}::${s}`] = !allEnabled; });
    }
    setPermisos(newPermisos);
  };

  const toggleSubmodule = (modulo: string, submodulo: string) => {
    setPermisos((prev) => ({ ...prev, [`${modulo}::${submodulo}`]: !prev[`${modulo}::${submodulo}`] }));
  };

  const handleSavePerms = async () => {
    if (!permRol) return;
    setSavingPerms(true);
    await supabase.from("permisos").delete().eq("rol_id", permRol.id);
    const rows: { rol_id: string; modulo: string; submodulo: string; habilitado: boolean }[] = [];
    Object.entries(permisos).forEach(([key, habilitado]) => {
      const [modulo, submodulo] = key.split("::");
      rows.push({ rol_id: permRol.id, modulo, submodulo, habilitado });
    });
    if (rows.length > 0) await supabase.from("permisos").insert(rows);
    setSavingPerms(false);
    setPermDialogOpen(false);
    showAdminToast("Permisos guardados");
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Usuarios y Roles</h1>
          <p className="text-sm text-muted-foreground">Gestionar usuarios, roles y permisos de acceso</p>
        </div>
      </div>

      {/* ======================== USUARIOS ======================== */}
      <div className="space-y-4">
        {/* Search + New */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por nombre o email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button onClick={openNewUser}>
            <Plus className="w-4 h-4 mr-2" />Nuevo
          </Button>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">No se encontraron usuarios</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nombre</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Email</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Rol</th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground">Estado</th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground">Admin</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => (
                      <tr key={u.id} className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors${!u.activo ? " opacity-50" : ""}`}>
                        <td className="py-3 px-4 font-medium">{u.nombre}</td>
                        <td className="py-3 px-4 text-muted-foreground">{u.email || "-"}</td>
                        <td className="py-3 px-4">
                          {u.roles?.nombre ? <Badge variant="secondary">{u.roles.nombre}</Badge> : <span className="text-muted-foreground">-</span>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button onClick={() => handleToggleActive(u)}>
                            <Badge variant={u.activo ? "default" : "outline"} className={u.activo ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 cursor-pointer" : "text-muted-foreground cursor-pointer"}>
                              {u.activo ? "Activo" : "Inactivo"}
                            </Badge>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {u.es_admin && <Shield className="w-4 h-4 text-amber-500 inline-block" />}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditUser(u)}><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeactivateUser(u)}><Trash2 className="w-4 h-4" /></Button>
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
      </div>

      {/* ======================== ROLES ======================== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">Roles y Permisos</h2>
              <p className="text-sm text-muted-foreground">Definir roles y configurar permisos de acceso</p>
            </div>
          </div>
          <Button onClick={openNewRol}><Plus className="w-4 h-4 mr-2" />Nuevo Rol</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : roles.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">No hay roles creados</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nombre</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Descripción</th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground">Usuarios</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((r) => (
                      <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-medium">{r.nombre}</td>
                        <td className="py-3 px-4 text-muted-foreground">{r.descripcion || "-"}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant="secondary" className="gap-1"><Users className="w-3 h-3" />{userCounts[r.id] || 0}</Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => openPermissions(r)}><Key className="w-4 h-4" />Permisos</Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditRol(r)}><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteRol(r)}><Trash2 className="w-4 h-4" /></Button>
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
      </div>

      {/* ─── User Dialog ─── */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingUser ? "Editar Usuario" : "Nuevo Usuario"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2"><Label>Nombre</Label><Input value={userForm.nombre} onChange={(e) => setUserForm({ ...userForm, nombre: e.target.value })} placeholder="Nombre completo" /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} placeholder="correo@ejemplo.com" /></div>
            {!editingUser && (
              <div className="space-y-2"><Label>Contraseña</Label><Input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder="Mínimo 6 caracteres" /></div>
            )}
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={userForm.rol_id || "none"} onValueChange={(v) => setUserForm({ ...userForm, rol_id: v === "none" ? "" : (v ?? "") })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar rol" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seleccionar rol</SelectItem>
                  {roles.map((r) => (<SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div><Label className="font-medium">Administrador</Label><p className="text-xs text-muted-foreground">Acceso total al sistema</p></div>
              <Switch checked={userForm.es_admin} onCheckedChange={(v) => setUserForm({ ...userForm, es_admin: v })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setUserDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveUser} disabled={saving || !userForm.nombre || !userForm.email}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingUser ? "Guardar" : "Crear Usuario"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Rol Dialog ─── */}
      <Dialog open={rolDialogOpen} onOpenChange={setRolDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingRol ? "Editar Rol" : "Nuevo Rol"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2"><Label>Nombre</Label><Input value={rolForm.nombre} onChange={(e) => setRolForm({ ...rolForm, nombre: e.target.value })} placeholder="Ej: Vendedor" /></div>
            <div className="space-y-2"><Label>Descripción</Label><Input value={rolForm.descripcion} onChange={(e) => setRolForm({ ...rolForm, descripcion: e.target.value })} placeholder="Descripción del rol" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setRolDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveRol} disabled={saving || !rolForm.nombre}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingRol ? "Guardar" : "Crear Rol"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Permissions Dialog ─── */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[70vh] sm:max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Key className="w-5 h-5" />Permisos: {permRol?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 pt-2">
            {MODULE_STRUCTURE.map((mod) => (
              <div key={mod.modulo}>
                <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50">
                  <span className="font-medium text-sm">{mod.modulo}</span>
                  <div className="flex items-center gap-2">
                    {isModulePartial(mod.modulo) && <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Parcial</span>}
                    <Switch checked={isModuleEnabled(mod.modulo)} onCheckedChange={() => toggleModule(mod.modulo)} />
                  </div>
                </div>
                {mod.submodulos.length > 0 && (
                  <div className="ml-6 border-l border-border pl-4 space-y-0.5 mb-1">
                    {mod.submodulos.map((sub) => (
                      <div key={`${mod.modulo}-${sub}`} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/30">
                        <span className="text-sm text-muted-foreground">{sub}</span>
                        <Switch checked={permisos[`${mod.modulo}::${sub}`] ?? false} onCheckedChange={() => toggleSubmodule(mod.modulo, sub)} />
                      </div>
                    ))}
                  </div>
                )}
                <Separator className="my-0.5" />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setPermDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSavePerms} disabled={savingPerms}>
              {savingPerms && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar Permisos
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Confirm Dialog ─── */}
      <Dialog open={confirmDialog.open} onOpenChange={(o) => setConfirmDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{confirmDialog.title}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{confirmDialog.message}</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>Cancelar</Button>
            <Button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({ ...prev, open: false })); }}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
