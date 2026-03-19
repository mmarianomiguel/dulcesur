"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Tag, Package, Loader2, FolderTree, Layers, AlertTriangle, ArrowRightLeft } from "lucide-react";

// ─── Shared modules ───
import { useAsyncData } from "@/hooks/use-async-data";
import { useDialog } from "@/hooks/use-dialog";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { SearchInput } from "@/components/search-input";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { showAdminToast } from "@/components/admin-toast";

interface Marca {
  id: string;
  nombre: string;
}

interface MarcaConConteo extends Marca {
  producto_count: number;
}

interface Categoria {
  id: string;
  nombre: string;
  producto_count: number;
}

interface Subcategoria {
  id: string;
  nombre: string;
  categoria_id: string;
  categoria_nombre?: string;
  producto_count: number;
}

interface ProductoAsociado {
  id: string;
  nombre: string;
  codigo?: string;
}

interface DeleteConfirm {
  type: "marca" | "categoria" | "subcategoria";
  id: string;
  nombre: string;
  productos: ProductoAsociado[];
  reassignTo: string;
}

export default function MarcasPage() {
  const [activeTab, setActiveTab] = useState("marcas");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [nombre, setNombre] = useState("");

  // Categories state
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Categoria | null>(null);
  const [catNombre, setCatNombre] = useState("");
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subcategoria | null>(null);
  const [subNombre, setSubNombre] = useState("");
  const [subCatId, setSubCatId] = useState("");

  // Delete confirmation dialog
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Simple delete (no products)
  const [simpleDelete, setSimpleDelete] = useState<{ type: string; id: string; nombre: string } | null>(null);

  const editDialog = useDialog<MarcaConConteo>();

  const fetchMarcas = useCallback(async (): Promise<MarcaConConteo[]> => {
    const { data: marcasData } = await supabase.from("marcas").select("*").order("nombre");
    if (!marcasData) return [];

    const { data: productos } = await supabase.from("productos").select("marca_id");
    const countMap: Record<string, number> = {};
    (productos ?? []).forEach((p: { marca_id: string | null }) => {
      if (p.marca_id) countMap[p.marca_id] = (countMap[p.marca_id] || 0) + 1;
    });

    return marcasData.map((m: Marca) => ({ ...m, producto_count: countMap[m.id] || 0 }));
  }, []);

  const { data: marcas, loading, refetch } = useAsyncData({
    fetcher: fetchMarcas,
    initialData: [],
  });

  const openCreate = () => {
    setNombre("");
    editDialog.onOpen();
  };

  const openEdit = (m: MarcaConConteo) => {
    setNombre(m.nombre);
    editDialog.onOpen(m);
  };

  const handleSave = async () => {
    if (!nombre.trim()) return;
    setSaving(true);
    if (editDialog.data) {
      await supabase.from("marcas").update({ nombre: nombre.trim() }).eq("id", editDialog.data.id);
    } else {
      await supabase.from("marcas").insert({ nombre: nombre.trim() });
    }
    setSaving(false);
    editDialog.onClose();
    showAdminToast(editDialog.data ? "Marca actualizada" : "Marca creada", "success");
    refetch();
  };

  const handleDelete = async (id: string) => {
    const marca = marcas.find((m) => m.id === id);
    if (!marca) return;
    if (marca.producto_count > 0) {
      // Fetch associated products
      const { data: prods } = await supabase
        .from("productos")
        .select("id, nombre, codigo")
        .eq("marca_id", id);
      setDeleteConfirm({
        type: "marca",
        id,
        nombre: marca.nombre,
        productos: prods || [],
        reassignTo: "",
      });
      return;
    }
    setSimpleDelete({ type: "marca", id, nombre: marca.nombre });
  };

  const confirmSimpleDelete = async () => {
    if (!simpleDelete) return;
    setDeleting(true);
    const { type, id } = simpleDelete;
    if (type === "marca") {
      await supabase.from("marcas").delete().eq("id", id);
      refetch();
    } else if (type === "categoria") {
      await supabase.from("categorias").delete().eq("id", id);
      fetchCategorias();
    } else if (type === "subcategoria") {
      await supabase.from("subcategorias").delete().eq("id", id);
      fetchCategorias();
    }
    showAdminToast(`${type === "marca" ? "Marca" : type === "categoria" ? "Categoría" : "Subcategoría"} eliminada`, "success");
    setDeleting(false);
    setSimpleDelete(null);
  };

  const confirmReassignAndDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const { type, id, reassignTo } = deleteConfirm;

      if (type === "marca") {
        await supabase
          .from("productos")
          .update({ marca_id: reassignTo || null })
          .eq("marca_id", id);
        await supabase.from("marcas").delete().eq("id", id);
        refetch();
      } else if (type === "categoria") {
        // Reassign products
        await supabase
          .from("productos")
          .update({ categoria_id: reassignTo || null })
          .eq("categoria_id", id);
        // Also move subcategorias to the new category or delete them
        if (reassignTo) {
          await supabase
            .from("subcategorias")
            .update({ categoria_id: reassignTo })
            .eq("categoria_id", id);
        } else {
          // Unlink subcategorias' products too
          const { data: subs } = await supabase.from("subcategorias").select("id").eq("categoria_id", id);
          if (subs && subs.length > 0) {
            const subIds = subs.map((s: any) => s.id);
            await supabase.from("productos").update({ subcategoria_id: null }).in("subcategoria_id", subIds);
          }
          await supabase.from("subcategorias").delete().eq("categoria_id", id);
        }
        await supabase.from("categorias").delete().eq("id", id);
        fetchCategorias();
      } else if (type === "subcategoria") {
        await supabase
          .from("productos")
          .update({ subcategoria_id: reassignTo || null })
          .eq("subcategoria_id", id);
        await supabase.from("subcategorias").delete().eq("id", id);
        fetchCategorias();
      }

      showAdminToast(
        reassignTo
          ? `Productos reasignados y ${type === "marca" ? "marca" : type === "categoria" ? "categoría" : "subcategoría"} eliminada`
          : `${type === "marca" ? "Marca" : type === "categoria" ? "Categoría" : "Subcategoría"} eliminada (productos sin asignar)`,
        "success"
      );
    } catch (err: any) {
      showAdminToast("Error al eliminar: " + (err.message || "Error desconocido"), "error");
    }
    setDeleting(false);
    setDeleteConfirm(null);
  };

  // ─── Categories fetch ───
  const fetchCategorias = useCallback(async () => {
    setCatLoading(true);
    const [{ data: cats }, { data: subs }, { data: prods }] = await Promise.all([
      supabase.from("categorias").select("id, nombre").order("nombre"),
      supabase.from("subcategorias").select("id, nombre, categoria_id").order("nombre"),
      supabase.from("productos").select("categoria_id, subcategoria_id"),
    ]);
    const catCount: Record<string, number> = {};
    const subCount: Record<string, number> = {};
    (prods ?? []).forEach((p: any) => {
      if (p.categoria_id) catCount[p.categoria_id] = (catCount[p.categoria_id] || 0) + 1;
      if (p.subcategoria_id) subCount[p.subcategoria_id] = (subCount[p.subcategoria_id] || 0) + 1;
    });
    const catMap: Record<string, string> = {};
    (cats ?? []).forEach((c: any) => { catMap[c.id] = c.nombre; });
    setCategorias((cats ?? []).map((c: any) => ({ ...c, producto_count: catCount[c.id] || 0 })));
    setSubcategorias((subs ?? []).map((s: any) => ({ ...s, categoria_nombre: catMap[s.categoria_id] || "—", producto_count: subCount[s.id] || 0 })));
    setCatLoading(false);
  }, []);

  useState(() => { fetchCategorias(); });

  const handleSaveCat = async () => {
    if (!catNombre.trim()) return;
    setSaving(true);
    if (editingCat) {
      await supabase.from("categorias").update({ nombre: catNombre.trim() }).eq("id", editingCat.id);
    } else {
      await supabase.from("categorias").insert({ nombre: catNombre.trim() });
    }
    setSaving(false);
    setCatDialogOpen(false);
    setEditingCat(null);
    setCatNombre("");
    showAdminToast(editingCat ? "Categoría actualizada" : "Categoría creada", "success");
    fetchCategorias();
  };

  const handleDeleteCat = async (id: string) => {
    const cat = categorias.find((c) => c.id === id);
    if (!cat) return;
    if (cat.producto_count > 0) {
      const { data: prods } = await supabase
        .from("productos")
        .select("id, nombre, codigo")
        .eq("categoria_id", id);
      setDeleteConfirm({
        type: "categoria",
        id,
        nombre: cat.nombre,
        productos: prods || [],
        reassignTo: "",
      });
      return;
    }
    setSimpleDelete({ type: "categoria", id, nombre: cat.nombre });
  };

  const handleSaveSub = async () => {
    if (!subNombre.trim() || !subCatId) return;
    setSaving(true);
    if (editingSub) {
      await supabase.from("subcategorias").update({ nombre: subNombre.trim(), categoria_id: subCatId }).eq("id", editingSub.id);
    } else {
      await supabase.from("subcategorias").insert({ nombre: subNombre.trim(), categoria_id: subCatId });
    }
    setSaving(false);
    setSubDialogOpen(false);
    setEditingSub(null);
    setSubNombre("");
    setSubCatId("");
    showAdminToast(editingSub ? "Subcategoría actualizada" : "Subcategoría creada", "success");
    fetchCategorias();
  };

  const handleDeleteSub = async (id: string) => {
    const sub = subcategorias.find((s) => s.id === id);
    if (!sub) return;
    if (sub.producto_count > 0) {
      const { data: prods } = await supabase
        .from("productos")
        .select("id, nombre, codigo")
        .eq("subcategoria_id", id);
      setDeleteConfirm({
        type: "subcategoria",
        id,
        nombre: sub.nombre,
        productos: prods || [],
        reassignTo: "",
      });
      return;
    }
    setSimpleDelete({ type: "subcategoria", id, nombre: sub.nombre });
  };

  // ─── Derived ───
  const filtered = marcas.filter((m) => m.nombre.toLowerCase().includes(search.toLowerCase()));
  const filteredCats = categorias.filter((c) => c.nombre.toLowerCase().includes(search.toLowerCase()));
  const filteredSubs = subcategorias.filter((s) => s.nombre.toLowerCase().includes(search.toLowerCase()) || (s.categoria_nombre || "").toLowerCase().includes(search.toLowerCase()));

  // Options for reassignment selects (exclude the one being deleted)
  const reassignOptions = () => {
    if (!deleteConfirm) return [];
    if (deleteConfirm.type === "marca") return marcas.filter((m) => m.id !== deleteConfirm.id);
    if (deleteConfirm.type === "categoria") return categorias.filter((c) => c.id !== deleteConfirm.id);
    if (deleteConfirm.type === "subcategoria") return subcategorias.filter((s) => s.id !== deleteConfirm.id);
    return [];
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <PageHeader
        title="Marcas y Categorías"
        description="Gestionar marcas, categorías y subcategorías de productos"
        backHref="/productos"
        actions={
          activeTab === "marcas" ? <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Nueva marca</Button>
          : activeTab === "categorias" ? <Button onClick={() => { setCatNombre(""); setEditingCat(null); setCatDialogOpen(true); }}><Plus className="w-4 h-4 mr-2" />Nueva categoría</Button>
          : <Button onClick={() => { setSubNombre(""); setSubCatId(""); setEditingSub(null); setSubDialogOpen(true); }}><Plus className="w-4 h-4 mr-2" />Nueva subcategoría</Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="marcas"><Tag className="w-3.5 h-3.5 mr-1.5" />Marcas</TabsTrigger>
          <TabsTrigger value="categorias"><FolderTree className="w-3.5 h-3.5 mr-1.5" />Categorías</TabsTrigger>
          <TabsTrigger value="subcategorias"><Layers className="w-3.5 h-3.5 mr-1.5" />Subcategorías</TabsTrigger>
        </TabsList>

        <TabsContent value="marcas" className="space-y-4 mt-4">

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard title="Total marcas" value={marcas.length} icon={Tag} />
        <StatCard title="Con productos" value={marcas.filter((m) => m.producto_count > 0).length} icon={Package} iconColor="text-emerald-600" iconBg="bg-emerald-100" />
        <StatCard title="Sin productos" value={marcas.filter((m) => m.producto_count === 0).length} icon={Tag} iconColor="text-gray-400" iconBg="bg-gray-100" />
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar marcas..." className="max-w-sm" />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <LoadingSpinner />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Tag}
              title={search ? "No se encontraron marcas" : "No hay marcas creadas"}
              action={!search ? { label: "Crear marca", onClick: openCreate } : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Nombre</th>
                    <th className="text-left px-4 py-3 font-medium">Productos</th>
                    <th className="text-right px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr key={m.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{m.nombre}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary"><Package className="w-3 h-3 mr-1" />{m.producto_count}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
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

        </TabsContent>

        {/* Categorías Tab */}
        <TabsContent value="categorias" className="space-y-4 mt-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar categorías..." className="max-w-sm" />
          <Card>
            <CardContent className="p-0">
              {catLoading ? <LoadingSpinner /> : filteredCats.length === 0 ? (
                <EmptyState icon={FolderTree} title="No hay categorías" action={{ label: "Crear categoría", onClick: () => { setCatNombre(""); setEditingCat(null); setCatDialogOpen(true); } }} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/50"><th className="text-left px-4 py-3 font-medium">Nombre</th><th className="text-left px-4 py-3 font-medium">Productos</th><th className="text-right px-4 py-3 font-medium">Acciones</th></tr></thead>
                    <tbody>
                      {filteredCats.map((c) => (
                        <tr key={c.id} className="border-b hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{c.nombre}</td>
                          <td className="px-4 py-3"><Badge variant="secondary"><Package className="w-3 h-3 mr-1" />{c.producto_count}</Badge></td>
                          <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => { setEditingCat(c); setCatNombre(c.nombre); setCatDialogOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteCat(c.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                          </div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subcategorías Tab */}
        <TabsContent value="subcategorias" className="space-y-4 mt-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar subcategorías..." className="max-w-sm" />
          <Card>
            <CardContent className="p-0">
              {catLoading ? <LoadingSpinner /> : filteredSubs.length === 0 ? (
                <EmptyState icon={Layers} title="No hay subcategorías" action={{ label: "Crear subcategoría", onClick: () => { setSubNombre(""); setSubCatId(""); setEditingSub(null); setSubDialogOpen(true); } }} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/50"><th className="text-left px-4 py-3 font-medium">Nombre</th><th className="text-left px-4 py-3 font-medium">Categoría</th><th className="text-left px-4 py-3 font-medium">Productos</th><th className="text-right px-4 py-3 font-medium">Acciones</th></tr></thead>
                    <tbody>
                      {filteredSubs.map((s) => (
                        <tr key={s.id} className="border-b hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{s.nombre}</td>
                          <td className="px-4 py-3 text-muted-foreground">{s.categoria_nombre}</td>
                          <td className="px-4 py-3"><Badge variant="secondary"><Package className="w-3 h-3 mr-1" />{s.producto_count}</Badge></td>
                          <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => { setEditingSub(s); setSubNombre(s.nombre); setSubCatId(s.categoria_id); setSubDialogOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteSub(s.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                          </div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Marca Create / Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={editDialog.setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editDialog.data ? "Editar Marca" : "Nueva Marca"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="marca-nombre">Nombre de la marca *</Label>
              <Input
                id="marca-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Arcor, Marolio, La Serenísima..."
                onKeyDown={(e) => { if (e.key === "Enter" && nombre.trim()) handleSave(); }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={editDialog.onClose}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !nombre.trim()}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editDialog.data ? "Guardar Cambios" : "Crear Marca"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Category Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingCat ? "Editar Categoría" : "Nueva Categoría"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre de la categoría *</Label>
              <Input value={catNombre} onChange={(e) => setCatNombre(e.target.value)} placeholder="Ej: Golosinas, Bebidas..." onKeyDown={(e) => { if (e.key === "Enter" && catNombre.trim()) handleSaveCat(); }} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCatDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveCat} disabled={saving || !catNombre.trim()}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingCat ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Subcategory Dialog */}
      <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingSub ? "Editar Subcategoría" : "Nueva Subcategoría"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Categoría padre *</Label>
              <Select value={subCatId} onValueChange={(v) => setSubCatId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nombre de la subcategoría *</Label>
              <Input value={subNombre} onChange={(e) => setSubNombre(e.target.value)} placeholder="Ej: Chocolates, Gaseosas..." onKeyDown={(e) => { if (e.key === "Enter" && subNombre.trim() && subCatId) handleSaveSub(); }} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSubDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveSub} disabled={saving || !subNombre.trim() || !subCatId}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingSub ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Simple Delete Confirmation Dialog */}
      <Dialog open={!!simpleDelete} onOpenChange={(open) => { if (!open) setSimpleDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              Confirmar eliminación
            </DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            ¿Eliminar <span className="font-semibold text-foreground">&quot;{simpleDelete?.nombre}&quot;</span>?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSimpleDelete(null)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmSimpleDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete with Reassignment Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {deleteConfirm?.type === "marca" ? "Marca" : deleteConfirm?.type === "categoria" ? "Categoría" : "Subcategoría"} con productos asociados
            </DialogTitle>
            <DialogDescription>
              Antes de eliminar, podés reasignar los productos a otra {deleteConfirm?.type === "marca" ? "marca" : deleteConfirm?.type === "categoria" ? "categoría" : "subcategoría"}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Product list */}
            <div>
              <p className="text-sm font-medium mb-2">
                {deleteConfirm?.productos.length} producto{(deleteConfirm?.productos.length || 0) !== 1 ? "s" : ""} asociado{(deleteConfirm?.productos.length || 0) !== 1 ? "s" : ""} a &quot;{deleteConfirm?.nombre}&quot;:
              </p>
              <div className="max-h-40 overflow-y-auto rounded-lg border bg-muted/30 p-2 space-y-1">
                {deleteConfirm?.productos.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-muted/50">
                    <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{p.nombre}</span>
                    {p.codigo && <span className="text-xs text-muted-foreground shrink-0">({p.codigo})</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Reassignment select */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Reasignar productos a:
              </Label>
              <Select
                value={deleteConfirm?.reassignTo || "__none__"}
                onValueChange={(v) => setDeleteConfirm((prev) => prev ? { ...prev, reassignTo: v === "__none__" ? "" : (v || "") } : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar destino (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin asignar (quitar {deleteConfirm?.type === "marca" ? "marca" : deleteConfirm?.type === "categoria" ? "categoría" : "subcategoría"})</SelectItem>
                  {reassignOptions().map((opt: any) => (
                    <SelectItem key={opt.id} value={opt.id}>{opt.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setDeleteConfirm(null)} disabled={deleting}>Cancelar</Button>
              <Button variant="destructive" onClick={confirmReassignAndDelete} disabled={deleting}>
                {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {deleteConfirm?.reassignTo ? "Reasignar y eliminar" : "Eliminar sin reasignar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
