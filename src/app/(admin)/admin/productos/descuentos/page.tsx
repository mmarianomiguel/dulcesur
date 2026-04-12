"use client";

import { useEffect, useState, useCallback } from "react";
import { todayARG, formatCurrency } from "@/lib/formatters";
import { norm } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Percent,
  Tag,
  Search,
  Check,
  X,
  Loader2,
  AlertCircle,
  DollarSign,
  Users,
  ChevronDown,
} from "lucide-react";
import { showAdminToast } from "@/components/admin-toast";

interface Descuento {
  id: string;
  nombre: string;
  descripcion: string | null;
  porcentaje: number;
  tipo_descuento: "porcentaje" | "precio_fijo";
  precio_fijo: number | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  aplica_a: string;
  categorias_ids: string[];
  subcategorias_ids: string[];
  productos_ids: string[];
  productos_excluidos_ids: string[];
  marcas_ids: string[];
  clientes_ids: string[];
  presentacion: string;
  cantidad_minima: number | null;
  activo: boolean;
  excluir_combos?: boolean;
  created_at: string;
  updated_at: string;
}

interface ClienteOption { id: string; nombre: string; cuit: string | null; }
interface Categoria { id: string; nombre: string; }
interface Subcategoria { id: string; nombre: string; categoria_id: string; }
interface ProductoOption { id: string; nombre: string; codigo: string; }
interface Marca { id: string; nombre: string; }

const QUICK_PERCENTS = [5, 10, 15, 20, 25, 30, 50];

function getEstado(d: Descuento): "activo" | "programado" | "vencido" | "inactivo" {
  if (!d.activo) return "inactivo";
  if (d.fecha_fin) {
    const fin = new Date(d.fecha_fin + "T23:59:59");
    if (fin < new Date()) return "vencido";
  }
  const inicio = new Date(d.fecha_inicio + "T00:00:00");
  if (inicio > new Date()) return "programado";
  return "activo";
}

function estadoBadge(estado: "activo" | "programado" | "vencido" | "inactivo") {
  switch (estado) {
    case "activo": return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Activo</Badge>;
    case "programado": return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Programado</Badge>;
    case "vencido": return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Vencido</Badge>;
    case "inactivo": return <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100">Inactivo</Badge>;
  }
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function DescuentosPage() {
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });

  // Form state
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [porcentaje, setPorcentaje] = useState(10);
  const [fechaInicio, setFechaInicio] = useState(() => todayARG());
  const [fechaFin, setFechaFin] = useState("");
  const [aplicaA, setAplicaA] = useState("todos");
  const [categoriasIds, setCategoriasIds] = useState<string[]>([]);
  const [subcategoriasIds, setSubcategoriasIds] = useState<string[]>([]);
  const [presentacion, setPresentacion] = useState("todas");
  const [cantidadMinima, setCantidadMinima] = useState<number | null>(null);
  const [excluirCombos, setExcluirCombos] = useState(true);
  const [productosIds, setProductosIds] = useState<string[]>([]);
  const [productosExcluidosIds, setProductosExcluidosIds] = useState<string[]>([]);
  const [marcasIds, setMarcasIds] = useState<string[]>([]);
  const [clientesIds, setClientesIds] = useState<string[]>([]);
  const [tipoDescuento, setTipoDescuento] = useState<"porcentaje" | "precio_fijo">("porcentaje");
  const [precioFijo, setPrecioFijo] = useState<number | null>(null);
  const [activo, setActivo] = useState(true);

  // Reference data
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [productosAll, setProductosAll] = useState<ProductoOption[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [clientesAll, setClientesAll] = useState<ClienteOption[]>([]);

  // Search states
  const [catSearch, setCatSearch] = useState("");
  const [expandedCats, setExpandedCats] = useState<string[]>([]);
  const [prodSearch, setProdSearch] = useState("");
  const [exclSearch, setExclSearch] = useState("");
  const [marcaSearch, setMarcaSearch] = useState("");
  const [clienteSearch, setClienteSearch] = useState("");
  const [showClienteSearch, setShowClienteSearch] = useState(false);
  const [showExclSearch, setShowExclSearch] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);

  const fetchDescuentos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("descuentos").select("*").order("created_at", { ascending: false });
    if (error) showAdminToast("Error al cargar descuentos: " + error.message, "error");
    setDescuentos(data ?? []);
    setLoading(false);
  }, []);

  const fetchCategorias = useCallback(async () => {
    const [{ data: cats }, { data: subs }, { data: prods }, { data: marcasData }, { data: clientesData }] = await Promise.all([
      supabase.from("categorias").select("id, nombre").order("nombre"),
      supabase.from("subcategorias").select("id, nombre, categoria_id").order("nombre"),
      supabase.from("productos").select("id, nombre, codigo").eq("activo", true).order("nombre").limit(10000),
      supabase.from("marcas").select("id, nombre").order("nombre"),
      supabase.from("clientes").select("id, nombre, cuit").eq("activo", true).order("nombre"),
    ]);
    setCategorias(cats ?? []);
    setSubcategorias(subs ?? []);
    setProductosAll(prods ?? []);
    setMarcas(marcasData ?? []);
    setClientesAll(clientesData ?? []);
  }, []);

  useEffect(() => { fetchDescuentos(); fetchCategorias(); }, [fetchDescuentos, fetchCategorias]);

  const resetWizard = () => {
    setNombre(""); setDescripcion(""); setPorcentaje(10);
    setFechaInicio(todayARG()); setFechaFin("");
    setAplicaA("todos"); setCategoriasIds([]); setSubcategoriasIds([]);
    setProductosIds([]); setProductosExcluidosIds([]); setMarcasIds([]);
    setPresentacion("todas"); setCantidadMinima(null); setExcluirCombos(true);
    setClientesIds([]); setTipoDescuento("porcentaje"); setPrecioFijo(null);
    setEditId(null); setCatSearch(""); setExpandedCats([]);
    setProdSearch(""); setExclSearch(""); setMarcaSearch(""); setClienteSearch("");
    setSaveError(null); setActivo(true);
    setShowClienteSearch(false); setShowExclSearch(false);
  };

  const openCreate = () => { resetWizard(); setDialogOpen(true); };

  const openEdit = (d: Descuento) => {
    setEditId(d.id); setNombre(d.nombre); setDescripcion(d.descripcion ?? "");
    setPorcentaje(Number(d.porcentaje)); setFechaInicio(d.fecha_inicio); setFechaFin(d.fecha_fin ?? "");
    setAplicaA(d.aplica_a); setCategoriasIds(d.categorias_ids ?? []); setSubcategoriasIds(d.subcategorias_ids ?? []);
    setProductosIds(d.productos_ids ?? []); setProductosExcluidosIds(d.productos_excluidos_ids ?? []);
    setMarcasIds(d.marcas_ids ?? []); setClientesIds(d.clientes_ids ?? []);
    setTipoDescuento(d.tipo_descuento || "porcentaje"); setPrecioFijo(d.precio_fijo ?? null);
    setPresentacion(d.presentacion); setCantidadMinima(d.cantidad_minima ?? null);
    setExcluirCombos((d as any).excluir_combos ?? true); setActivo(d.activo);
    setSaveError(null); setDialogOpen(true);
    setShowClienteSearch(d.clientes_ids?.length > 0); setShowExclSearch(d.productos_excluidos_ids?.length > 0);
  };

  const handleSave = async () => {
    setSaving(true); setSaveError(null);
    const payload: Record<string, any> = {
      nombre, descripcion: descripcion || null, porcentaje,
      fecha_inicio: fechaInicio, fecha_fin: fechaFin || null,
      aplica_a: aplicaA,
      categorias_ids: aplicaA === "categorias" ? categoriasIds : [],
      subcategorias_ids: aplicaA === "subcategorias" ? subcategoriasIds : [],
      productos_ids: aplicaA === "productos" ? productosIds : [],
      productos_excluidos_ids: productosExcluidosIds.length > 0 ? productosExcluidosIds : [],
      marcas_ids: marcasIds.length > 0 ? marcasIds : [],
      clientes_ids: clientesIds.length > 0 ? clientesIds : [],
      tipo_descuento: tipoDescuento,
      precio_fijo: tipoDescuento === "precio_fijo" ? precioFijo : null,
      presentacion, cantidad_minima: cantidadMinima && cantidadMinima > 0 ? cantidadMinima : null,
      excluir_combos: excluirCombos, updated_at: new Date().toISOString(),
    };
    try {
      if (editId) {
        payload.activo = activo;
        const { error } = await supabase.from("descuentos").update(payload).eq("id", editId);
        if (error) throw error;
        showAdminToast("Descuento actualizado correctamente", "success");
      } else {
        const { error } = await supabase.from("descuentos").insert({ ...payload, activo });
        if (error) throw error;
        showAdminToast("Descuento creado correctamente", "success");
      }
      setSaving(false); setDialogOpen(false); resetWizard(); fetchDescuentos();
    } catch (err: any) {
      const msg = err.message || "Error al guardar el descuento";
      setSaveError(msg); showAdminToast(msg, "error"); setSaving(false);
    }
  };

  const toggleActivo = async (d: Descuento) => {
    const { error } = await supabase.from("descuentos").update({ activo: !d.activo, updated_at: new Date().toISOString() }).eq("id", d.id);
    if (error) { showAdminToast("Error al cambiar estado: " + error.message, "error"); return; }
    fetchDescuentos();
  };

  const handleDelete = (id: string) => {
    setConfirmDialog({
      open: true, title: "Eliminar descuento", message: "¿Eliminar este descuento?",
      onConfirm: async () => {
        const { error } = await supabase.from("descuentos").delete().eq("id", id);
        if (error) { showAdminToast("Error al eliminar: " + error.message, "error"); return; }
        showAdminToast("Descuento eliminado", "success"); fetchDescuentos();
      },
    });
  };

  // Stats
  const today = new Date();
  const totalDescuentos = descuentos.length;
  const activosCount = descuentos.filter((d) => getEstado(d) === "activo").length;
  const vencidos = descuentos.filter((d) => getEstado(d) === "vencido").length;
  const proximosVencer = descuentos.filter((d) => {
    if (!d.activo || !d.fecha_fin) return false;
    const diff = (new Date(d.fecha_fin).getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }).length;

  // Helpers
  const subsForCat = (catId: string) => subcategorias.filter((s) => s.categoria_id === catId);
  const filteredCats = categorias.filter((c) => norm(c.nombre).includes(norm(catSearch)));
  const toggleCatExpand = (id: string) => setExpandedCats((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleCatSelect = (id: string) => setCategoriasIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const filteredProds = productosAll.filter((p) => norm(p.nombre).includes(norm(prodSearch)) || norm(p.codigo).includes(norm(prodSearch)));
  const filteredMarcas = marcas.filter((m) => m.nombre.toLowerCase().includes(marcaSearch.toLowerCase()));
  const toggleMarcaSelect = (id: string) => setMarcasIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const addDuration = (days: number | null) => {
    if (days === null) { setFechaFin(""); return; }
    const d = new Date(fechaInicio); d.setDate(d.getDate() + days);
    setFechaFin(d.toISOString().split("T")[0]);
  };

  const aplicaALabel = (v: string) => {
    switch (v) { case "todos": return "Todos"; case "categorias": return "Categorías"; case "subcategorias": return "Subcategorías"; case "productos": return "Productos"; default: return v; }
  };
  const presentacionLabel = (v: string) => {
    switch (v) { case "todas": return "Todas"; case "unidad": return "Solo unidad"; case "caja": return "Solo caja"; default: return v; }
  };
  const getMarcaNames = (ids: string[]) => ids?.map((id) => marcas.find((m) => m.id === id)?.nombre).filter(Boolean).join(", ") || "";

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10"><Percent className="w-5 h-5 text-primary" /></div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Descuentos</h1>
            <p className="text-sm text-muted-foreground">Gestión de descuentos y promociones</p>
          </div>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Crear descuento</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Total</div><div className="text-2xl font-bold">{totalDescuentos}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Activos</div><div className="text-2xl font-bold text-green-600">{activosCount}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Vencidos</div><div className="text-2xl font-bold text-red-600">{vencidos}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Próximos a vencer</div><div className="text-2xl font-bold text-amber-600">{proximosVencer}</div></CardContent></Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : descuentos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No hay descuentos creados</p>
              <Button variant="outline" className="mt-3" onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Crear descuento</Button>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              <div className="space-y-2">
                {descuentos.map((d) => {
                  const estado = getEstado(d);
                  return (
                    <div
                      key={d.id}
                      className={`flex items-start gap-3 px-4 py-3.5 border rounded-xl cursor-pointer hover:border-primary/30 transition-all bg-background ${
                        estado === "vencido" || estado === "inactivo"
                          ? "opacity-60"
                          : ""
                      }`}
                      onClick={() => openEdit(d)}
                    >
                      {/* Value badge */}
                      <div className="flex-shrink-0 min-w-[52px] text-center px-2 py-2 rounded-lg bg-primary/[0.08] border border-primary/15">
                        <p className="text-base font-semibold text-primary">
                          {d.tipo_descuento === "precio_fijo"
                            ? formatCurrency(d.precio_fijo || 0)
                            : `${Number(d.porcentaje)}%`}
                        </p>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{d.nombre}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {estadoBadge(estado)}
                          <span className="text-muted-foreground text-[10px]">·</span>
                          <span className="text-xs text-muted-foreground">
                            {aplicaALabel(d.aplica_a)}
                          </span>
                          {d.aplica_a === "productos" &&
                            d.productos_ids?.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                ({d.productos_ids.length})
                              </span>
                            )}
                          <span className="text-muted-foreground text-[10px]">·</span>
                          <span className="text-xs text-muted-foreground">
                            {presentacionLabel(d.presentacion)}
                          </span>
                          <span className="text-muted-foreground text-[10px]">·</span>
                          <span className="text-xs text-muted-foreground">
                            {d.fecha_fin
                              ? `${formatDate(d.fecha_inicio)} → ${formatDate(d.fecha_fin)}`
                              : "Permanente"}
                          </span>
                          {d.clientes_ids?.length > 0 && (
                            <>
                              <span className="text-muted-foreground text-[10px]">·</span>
                              <span className="text-xs text-blue-600 font-medium">
                                {d.clientes_ids.length} cliente(s) exclusivo(s)
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(d)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => toggleActivo(d)}
                        >
                          {d.activo ? (
                            <ToggleRight className="w-4 h-4 text-green-600" />
                          ) : (
                            <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:text-destructive"
                          onClick={() => handleDelete(d.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {descuentos.length === 0 && !loading && (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No hay descuentos creados.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog — two-column layout */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b bg-muted/30 shrink-0">
            <DialogTitle>{editId ? "Editar descuento" : "Nuevo descuento"}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col sm:flex-row">
              {/* Left column — form fields */}
              <div className="flex-1 p-6 space-y-5 overflow-y-auto">

                {/* 1. Información básica */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Nombre del descuento *</Label>
                    <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Promo caja cerrada harinas" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Descripción (opcional)</Label>
                    <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className="mt-1 resize-none text-sm" />
                  </div>
                </div>

                <Separator />

                {/* 2. Tipo y valor */}
                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground font-semibold">Tipo de descuento</Label>
                  <div className="flex gap-2">
                    <button onClick={() => setTipoDescuento("porcentaje")} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${tipoDescuento === "porcentaje" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>Porcentaje</button>
                    <button onClick={() => setTipoDescuento("precio_fijo")} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${tipoDescuento === "precio_fijo" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>Precio fijo</button>
                  </div>
                  {tipoDescuento === "porcentaje" ? (
                    <div className="space-y-2">
                      <Input type="number" min={1} max={100} value={porcentaje} onChange={(e) => setPorcentaje(Math.max(1, Math.min(100, Number(e.target.value))))} className="text-center text-lg font-semibold" />
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_PERCENTS.map((p) => (
                          <button key={p} onClick={() => setPorcentaje(p)} className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${porcentaje === p ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>{p}%</button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs text-muted-foreground">Precio fijo</Label>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                        <Input type="number" min={0} value={precioFijo ?? ""} onChange={(e) => setPrecioFijo(e.target.value ? Number(e.target.value) : null)} className="pl-7 text-lg font-semibold" placeholder="0" />
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* 3. Vigencia */}
                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground font-semibold">Vigencia</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs text-muted-foreground">Desde *</Label><Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="mt-1" /></div>
                    <div><Label className="text-xs text-muted-foreground">Hasta (vacío = permanente)</Label><Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="mt-1" /></div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[{ label: "7 días", days: 7 }, { label: "15 días", days: 15 }, { label: "30 días", days: 30 }, { label: "90 días", days: 90 }, { label: "Permanente", days: null }].map(({ label, days }) => (
                      <button key={label} onClick={() => addDuration(days)} className="px-2.5 py-1 rounded-lg text-xs font-medium border border-border hover:border-primary/50 transition-all">{label}</button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* 4. Aplica a */}
                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground font-semibold">Aplica a</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(["todos", "categorias", "subcategorias", "productos"] as const).map((v) => (
                      <button key={v} onClick={() => setAplicaA(v)} className={`py-2 rounded-lg text-xs font-medium border transition-all ${aplicaA === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                        {aplicaALabel(v)}
                      </button>
                    ))}
                  </div>

                  {/* Category/Subcategory selector */}
                  {(aplicaA === "categorias" || aplicaA === "subcategorias") && (
                    <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input placeholder="Buscar categoría..." value={catSearch} onChange={(e) => setCatSearch(e.target.value)} className="h-8 text-xs pl-8" />
                      </div>
                      {filteredCats.map((cat) => {
                        const subs = subsForCat(cat.id);
                        const isExpanded = expandedCats.includes(cat.id);
                        const isCatSelected = aplicaA === "categorias" && categoriasIds.includes(cat.id);
                        return (
                          <div key={cat.id}>
                            <div className="flex items-center gap-2 py-1">
                              {aplicaA === "subcategorias" && subs.length > 0 && (
                                <button onClick={() => toggleCatExpand(cat.id)}><ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} /></button>
                              )}
                              <button onClick={() => aplicaA === "categorias" ? toggleCatSelect(cat.id) : toggleCatExpand(cat.id)} className="flex items-center gap-2 flex-1 text-left">
                                {aplicaA === "categorias" && (
                                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isCatSelected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                                    {isCatSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                                  </div>
                                )}
                                <span className="text-sm">{cat.nombre}</span>
                              </button>
                            </div>
                            {aplicaA === "subcategorias" && isExpanded && subs.map((sub) => {
                              const isSubSelected = subcategoriasIds.includes(sub.id);
                              return (
                                <button key={sub.id} onClick={() => setSubcategoriasIds((prev) => prev.includes(sub.id) ? prev.filter((x) => x !== sub.id) : [...prev, sub.id])} className="flex items-center gap-2 pl-8 py-1 w-full text-left">
                                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isSubSelected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                                    {isSubSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                                  </div>
                                  <span className="text-sm">{sub.nombre}</span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Product selector */}
                  {aplicaA === "productos" && (
                    <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input placeholder="Buscar producto..." value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} className="h-8 text-xs pl-8" />
                      </div>
                      {productosIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pb-2 border-b">
                          {productosIds.map((id) => {
                            const p = productosAll.find((pr) => pr.id === id);
                            return (
                              <Badge key={id} variant="secondary" className="gap-1 pr-1">
                                {p?.nombre || id.slice(0, 8)}
                                <button onClick={() => setProductosIds((prev) => prev.filter((x) => x !== id))} className="hover:bg-muted rounded-full p-0.5"><X className="w-3 h-3" /></button>
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                      {filteredProds.slice(0, 50).map((p) => {
                        const isSelected = productosIds.includes(p.id);
                        return (
                          <button key={p.id} onClick={() => setProductosIds((prev) => isSelected ? prev.filter((x) => x !== p.id) : [...prev, p.id])} className="flex items-center gap-2 py-1 w-full text-left">
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                              {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                            </div>
                            <span className="text-xs font-mono text-muted-foreground w-20 shrink-0 truncate">{p.codigo}</span>
                            <span className="text-sm truncate">{p.nombre}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Separator />

                {/* 5. Opciones adicionales */}
                <div className="space-y-0 divide-y border rounded-lg overflow-hidden">
                  {/* Presentación */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div><p className="text-sm font-medium">Presentación</p><p className="text-xs text-muted-foreground">{presentacionLabel(presentacion)}</p></div>
                    <div className="flex gap-1">
                      {(["todas", "unidad", "caja"] as const).map((v) => (
                        <button key={v} onClick={() => setPresentacion(v)} className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${presentacion === v ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                          {v === "todas" ? "Todas" : v === "unidad" ? "Unidad" : "Caja"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cantidad mínima */}
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div><p className="text-sm font-medium">Cantidad mínima</p><p className="text-xs text-muted-foreground">Solo aplica si compra N+ unidades</p></div>
                    <Input type="number" min={0} value={cantidadMinima ?? ""} onChange={(e) => setCantidadMinima(e.target.value ? Number(e.target.value) : null)} placeholder="Sin límite" className="w-24 text-center" />
                  </div>

                  {/* Excluir combos */}
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div><p className="text-sm font-medium">Excluir combos</p><p className="text-xs text-muted-foreground">No aplicar a productos tipo combo</p></div>
                    <button type="button" onClick={() => setExcluirCombos(!excluirCombos)} className={`relative w-10 h-5 rounded-full transition-colors ${excluirCombos ? "bg-primary" : "bg-muted-foreground/30"}`}>
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${excluirCombos ? "translate-x-5" : ""}`} />
                    </button>
                  </div>

                  {/* Clientes exclusivos */}
                  <div>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Clientes exclusivos</p>
                        <p className="text-xs text-muted-foreground">{clientesIds.length > 0 ? `${clientesIds.length} cliente(s) — oculto para el resto` : "Visible para todos"}</p>
                      </div>
                      <button type="button" onClick={() => setShowClienteSearch(!showClienteSearch)} className="text-xs text-primary hover:underline">
                        {showClienteSearch ? "Cerrar" : clientesIds.length > 0 ? "Editar" : "Seleccionar"}
                      </button>
                    </div>
                    {showClienteSearch && (
                      <div className="px-4 pb-3 space-y-2">
                        {clientesIds.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {clientesIds.map((id) => {
                              const c = clientesAll.find((cl) => cl.id === id);
                              return (
                                <Badge key={id} variant="secondary" className="gap-1 pr-1 bg-blue-50 text-blue-700 border-blue-200">
                                  {c?.nombre || id.slice(0, 8)}
                                  <button onClick={() => setClientesIds((prev) => prev.filter((x) => x !== id))} className="hover:bg-blue-200 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                        <Input placeholder="Buscar cliente por nombre o CUIT..." value={clienteSearch} onChange={(e) => setClienteSearch(e.target.value)} className="h-8 text-sm" />
                        {clienteSearch.trim() && (
                          <div className="max-h-32 overflow-y-auto space-y-0.5">
                            {clientesAll.filter((c) => norm(c.nombre).includes(norm(clienteSearch)) || (c.cuit && c.cuit.includes(clienteSearch))).slice(0, 20).map((c) => (
                              <button key={c.id} onClick={() => { if (!clientesIds.includes(c.id)) setClientesIds([...clientesIds, c.id]); setClienteSearch(""); }} className="flex items-center gap-2 w-full text-left py-1 px-2 rounded hover:bg-muted text-sm">
                                <span>{c.nombre}</span>{c.cuit && <span className="text-xs text-muted-foreground">{c.cuit}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Excluir productos */}
                  {aplicaA !== "productos" && (
                    <div>
                      <div className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Excluir productos</p>
                          <p className="text-xs text-muted-foreground">{productosExcluidosIds.length > 0 ? `${productosExcluidosIds.length} excluido(s)` : "Ninguno"}</p>
                        </div>
                        <button type="button" onClick={() => setShowExclSearch(!showExclSearch)} className="text-xs text-primary hover:underline">{showExclSearch ? "Cerrar" : "Gestionar"}</button>
                      </div>
                      {showExclSearch && (
                        <div className="px-4 pb-3 space-y-2">
                          {productosExcluidosIds.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {productosExcluidosIds.map((id) => {
                                const p = productosAll.find((pr) => pr.id === id);
                                return (
                                  <Badge key={id} variant="secondary" className="gap-1 pr-1 bg-red-50 text-red-700 border-red-200">
                                    {p?.nombre || id.slice(0, 8)}
                                    <button onClick={() => setProductosExcluidosIds((prev) => prev.filter((x) => x !== id))} className="hover:bg-red-200 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                          <Input placeholder="Buscar producto..." value={exclSearch} onChange={(e) => setExclSearch(e.target.value)} className="h-8 text-sm" />
                          {exclSearch.trim() && (
                            <div className="max-h-32 overflow-y-auto space-y-0.5">
                              {productosAll.filter((p) => norm(p.nombre).includes(norm(exclSearch)) || norm(p.codigo).includes(norm(exclSearch))).slice(0, 20).map((p) => (
                                <button key={p.id} onClick={() => { if (!productosExcluidosIds.includes(p.id)) setProductosExcluidosIds([...productosExcluidosIds, p.id]); setExclSearch(""); }} className="flex items-center gap-2 w-full text-left py-1 px-2 rounded hover:bg-muted text-sm">
                                  <span className="font-mono text-xs text-muted-foreground w-20 truncate">{p.codigo}</span>
                                  <span>{p.nombre}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right column — live summary */}
              <div className="w-full sm:w-56 shrink-0 bg-muted/30 p-4 space-y-4 border-t sm:border-t-0 sm:border-l">
                <div className="text-center bg-white rounded-lg p-3 border">
                  <div className="text-2xl font-bold text-primary">
                    {tipoDescuento === "precio_fijo" ? formatCurrency(precioFijo || 0) : `${porcentaje}%`}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">de descuento</div>
                </div>

                <div className="space-y-2 text-xs">
                  {[
                    { key: "Aplica a", val: aplicaALabel(aplicaA) + (aplicaA === "categorias" && categoriasIds.length > 0 ? ` (${categoriasIds.length})` : aplicaA === "productos" && productosIds.length > 0 ? ` (${productosIds.length})` : "") },
                    { key: "Vigencia", val: fechaFin ? `Hasta ${formatDate(fechaFin)}` : "Permanente" },
                    { key: "Presentación", val: presentacionLabel(presentacion) },
                    { key: "Clientes", val: clientesIds.length > 0 ? `${clientesIds.length} exclusivos` : "Todos" },
                    ...(cantidadMinima ? [{ key: "Mín.", val: `${cantidadMinima} unidades` }] : []),
                    ...(productosExcluidosIds.length > 0 ? [{ key: "Excluidos", val: `${productosExcluidosIds.length} productos` }] : []),
                  ].map(({ key, val }) => (
                    <div key={key} className="flex justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">{key}</span>
                      <span className="font-medium text-right truncate">{val}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t space-y-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Estado al guardar</p>
                  <div className="flex gap-1.5">
                    <button onClick={() => setActivo(true)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${activo ? "bg-emerald-600 text-white border-emerald-600" : "border-border text-muted-foreground"}`}>Activo</button>
                    <button onClick={() => setActivo(false)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${!activo ? "bg-muted text-muted-foreground border-border" : "border-border text-muted-foreground"}`}>Inactivo</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center px-6 py-3 border-t bg-muted/30 shrink-0">
            <div className="text-xs text-muted-foreground">
              {saveError && <span className="text-red-500">{saveError}</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setDialogOpen(false); resetWizard(); }}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !nombre.trim() || !fechaInicio}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editId ? "Guardar cambios" : "Crear descuento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(o) => setConfirmDialog((prev) => ({ ...prev, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{confirmDialog.title}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{confirmDialog.message}</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}>Cancelar</Button>
            <Button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog((prev) => ({ ...prev, open: false })); }}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
