"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Search, Edit, Trash2, Loader2, List, Percent, Tag, Printer, Copy, Check, X,
} from "lucide-react";

interface Lista {
  id: string;
  nombre: string;
  descripcion: string | null;
  porcentaje_ajuste: number;
  activa: boolean;
  es_default: boolean;
  created_at: string;
}

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  costo: number;
}

interface ListaItem {
  id: string;
  lista_id: string;
  producto_id: string;
  precio_custom: number | null;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(v);
}

export default function ListasPreciosPage() {
  const [listas, setListas] = useState<Lista[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLista, setEditingLista] = useState<Lista | null>(null);
  const [form, setForm] = useState({ nombre: "", descripcion: "", porcentaje_ajuste: 0 });
  const [saving, setSaving] = useState(false);

  // Detail view
  const [detailLista, setDetailLista] = useState<Lista | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [listaItems, setListaItems] = useState<ListaItem[]>([]);
  const [search, setSearch] = useState("");
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});

  const fetchListas = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("listas_precios").select("*").order("created_at");
    setListas((data as Lista[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchListas(); }, [fetchListas]);

  const openNew = () => {
    setEditingLista(null);
    setForm({ nombre: "", descripcion: "", porcentaje_ajuste: 0 });
    setDialogOpen(true);
  };

  const openEdit = (l: Lista) => {
    setEditingLista(l);
    setForm({ nombre: l.nombre, descripcion: l.descripcion || "", porcentaje_ajuste: l.porcentaje_ajuste });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    if (editingLista) {
      await supabase.from("listas_precios").update(form).eq("id", editingLista.id);
    } else {
      await supabase.from("listas_precios").insert(form);
    }
    setDialogOpen(false);
    fetchListas();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("listas_precios").delete().eq("id", id);
    fetchListas();
  };

  const setDefault = async (id: string) => {
    await supabase.from("listas_precios").update({ es_default: false }).neq("id", "");
    await supabase.from("listas_precios").update({ es_default: true }).eq("id", id);
    fetchListas();
  };

  const openDetail = async (l: Lista) => {
    setDetailLista(l);
    const [{ data: prods }, { data: items }] = await Promise.all([
      supabase.from("productos").select("id, codigo, nombre, precio, costo").eq("activo", true).order("nombre"),
      supabase.from("lista_precio_items").select("*").eq("lista_id", l.id),
    ]);
    setProductos((prods as Producto[]) || []);
    setListaItems((items as ListaItem[]) || []);
    setEditingPrices({});
  };

  const getListPrice = (prod: Producto) => {
    if (!detailLista) return prod.precio;
    const custom = listaItems.find((i) => i.producto_id === prod.id);
    if (custom?.precio_custom) return custom.precio_custom;
    return Math.round(prod.precio * (1 + detailLista.porcentaje_ajuste / 100));
  };

  const savePrice = async (productoId: string, price: number) => {
    if (!detailLista) return;
    const existing = listaItems.find((i) => i.producto_id === productoId);
    if (existing) {
      await supabase.from("lista_precio_items").update({ precio_custom: price }).eq("id", existing.id);
    } else {
      await supabase.from("lista_precio_items").insert({ lista_id: detailLista.id, producto_id: productoId, precio_custom: price });
    }
    // Refresh
    const { data } = await supabase.from("lista_precio_items").select("*").eq("lista_id", detailLista.id);
    setListaItems((data as ListaItem[]) || []);
    setEditingPrices((prev) => { const n = { ...prev }; delete n[productoId]; return n; });
  };

  const applyBulkPercentage = async () => {
    if (!detailLista) return;
    // Delete all custom prices, rely on porcentaje_ajuste
    await supabase.from("lista_precio_items").delete().eq("lista_id", detailLista.id);
    setListaItems([]);
  };

  const filteredProducts = productos.filter(
    (p) => p.nombre.toLowerCase().includes(search.toLowerCase()) || p.codigo.toLowerCase().includes(search.toLowerCase())
  );

  // Detail view
  if (detailLista) {
    return (
      <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" className="mb-2" onClick={() => setDetailLista(null)}>
              &larr; Volver
            </Button>
            <h1 className="text-xl sm:text-2xl font-bold">{detailLista.nombre}</h1>
            <p className="text-sm text-muted-foreground">
              Ajuste general: <strong>{detailLista.porcentaje_ajuste > 0 ? "+" : ""}{detailLista.porcentaje_ajuste}%</strong>
              {detailLista.descripcion && ` | ${detailLista.descripcion}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={applyBulkPercentage}>
              <Percent className="w-4 h-4 mr-1.5" />
              Limpiar precios custom
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">Producto</th>
                <th className="text-right py-2 px-3 font-medium w-28">P. Base</th>
                <th className="text-right py-2 px-3 font-medium w-32">P. Lista</th>
                <th className="text-center py-2 px-3 font-medium w-20">Dif.</th>
                <th className="text-right py-2 px-3 font-medium w-36">Precio Custom</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.slice(0, 50).map((p) => {
                const listPrice = getListPrice(p);
                const hasCustom = listaItems.some((i) => i.producto_id === p.id && i.precio_custom);
                const diff = listPrice > 0 && p.precio > 0 ? ((listPrice - p.precio) / p.precio * 100) : 0;
                const editing = editingPrices[p.id];
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 px-3">
                      <p className="font-medium">{p.nombre}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.codigo}</p>
                    </td>
                    <td className="py-2 px-3 text-right">{formatCurrency(p.precio)}</td>
                    <td className="py-2 px-3 text-right font-semibold">
                      {formatCurrency(listPrice)}
                      {hasCustom && <Badge variant="outline" className="ml-1 text-[10px]">Custom</Badge>}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-xs font-medium ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                        {diff > 0 ? "+" : ""}{diff.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {editing !== undefined ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Input
                            type="number"
                            value={editing}
                            onChange={(e) => setEditingPrices({ ...editingPrices, [p.id]: e.target.value })}
                            className="h-7 w-24 text-sm text-right"
                            autoFocus
                          />
                          <Button size="icon" className="h-7 w-7" onClick={() => savePrice(p.id, Number(editing))}>
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingPrices((prev) => { const n = { ...prev }; delete n[p.id]; return n; })}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingPrices({ ...editingPrices, [p.id]: String(listPrice) })}>
                          <Edit className="w-3 h-3 mr-1" />
                          Editar
                        </Button>
                      )}
                    </td>
                    <td></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Listas de Precios</h1>
          <p className="text-muted-foreground text-sm">{listas.length} listas configuradas</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Nueva Lista</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : listas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <List className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No hay listas de precios</p>
            <Button className="mt-4" onClick={openNew}><Plus className="w-4 h-4 mr-2" />Crear primera lista</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {listas.map((l) => (
            <Card key={l.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{l.nombre}</CardTitle>
                  <div className="flex gap-1">
                    {l.es_default && <Badge className="text-[10px]">Default</Badge>}
                    <Badge variant={l.activa ? "secondary" : "outline"} className="text-[10px]">
                      {l.activa ? "Activa" : "Inactiva"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {l.descripcion && <p className="text-sm text-muted-foreground">{l.descripcion}</p>}
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {l.porcentaje_ajuste > 0 ? "+" : ""}{l.porcentaje_ajuste}% sobre precio base
                  </span>
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openDetail(l)}>
                    <Tag className="w-3.5 h-3.5 mr-1.5" />Precios
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(l)}>
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  {!l.es_default && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDefault(l.id)} title="Marcar como default">
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(l.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLista ? "Editar Lista" : "Nueva Lista de Precios"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Mayorista" />
            </div>
            <div className="space-y-2">
              <Label>Descripcion (opcional)</Label>
              <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Porcentaje de ajuste sobre precio base</Label>
              <div className="flex items-center gap-2">
                <Input type="number" value={form.porcentaje_ajuste} onChange={(e) => setForm({ ...form, porcentaje_ajuste: Number(e.target.value) })} className="w-28" />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">Positivo = aumento, Negativo = descuento. Se puede personalizar por producto.</p>
            </div>
            <Button onClick={handleSave} disabled={!form.nombre.trim() || saving} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingLista ? "Guardar cambios" : "Crear Lista"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
