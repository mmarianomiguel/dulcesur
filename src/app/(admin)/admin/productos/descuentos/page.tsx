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
  Calendar,
  Percent,
  Tag,
  Package,
  ChevronRight,
  ChevronDown,
  Search,
  Check,
  X,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Clock,
  AlertCircle,
  DollarSign,
  Users,
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
  created_at: string;
  updated_at: string;
}

interface ClienteOption {
  id: string;
  nombre: string;
  cuit: string | null;
}

interface Categoria {
  id: string;
  nombre: string;
}

interface Subcategoria {
  id: string;
  nombre: string;
  categoria_id: string;
}

interface ProductoOption {
  id: string;
  nombre: string;
  codigo: string;
}

interface Marca {
  id: string;
  nombre: string;
}

const STEPS = [
  { label: "Información", desc: "Nombre y descripción" },
  { label: "Porcentaje", desc: "Valor del descuento" },
  { label: "Vigencia", desc: "Período de validez" },
  { label: "Aplicar a", desc: "Productos o categorías" },
];

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
    case "activo":
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Activo</Badge>;
    case "programado":
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Programado</Badge>;
    case "vencido":
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Vencido</Badge>;
    case "inactivo":
      return <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100">Inactivo</Badge>;
  }
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function daysBetween(a: string, b: string) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export default function DescuentosPage() {
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });

  // wizard state
  const [step, setStep] = useState(0);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [porcentaje, setPorcentaje] = useState(10);
  const [fechaInicio, setFechaInicio] = useState(() => todayARG());
  const [fechaFin, setFechaFin] = useState("");
  const [aplicaA, setAplicaA] = useState("todos");
  const [categoriasIds, setCategoriasIds] = useState<string[]>([]);
  const [subcategoriasIds, setSubcategoriasIds] = useState<string[]>([]);
  const [presentacion, setPresentación] = useState("todas");
  const [cantidadMinima, setCantidadMinima] = useState<number | null>(null);
  const [excluirCombos, setExcluirCombos] = useState(true);
  const [productosIds, setProductosIds] = useState<string[]>([]);
  const [productosExcluidosIds, setProductosExcluidosIds] = useState<string[]>([]);
  const [marcasIds, setMarcasIds] = useState<string[]>([]);
  const [clientesIds, setClientesIds] = useState<string[]>([]);
  const [tipoDescuento, setTipoDescuento] = useState<"porcentaje" | "precio_fijo">("porcentaje");
  const [precioFijo, setPrecioFijo] = useState<number | null>(null);

  // categories for step 4
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [catSearch, setCatSearch] = useState("");
  const [expandedCats, setExpandedCats] = useState<string[]>([]);

  // products for step 4
  const [productosAll, setProductosAll] = useState<ProductoOption[]>([]);
  const [prodSearch, setProdSearch] = useState("");

  // excluded products
  const [exclSearch, setExclSearch] = useState("");

  // marcas for step 4
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [marcaSearch, setMarcaSearch] = useState("");

  // clientes for client-specific discounts
  const [clientesAll, setClientesAll] = useState<ClienteOption[]>([]);
  const [clienteSearch, setClienteSearch] = useState("");

  // editing
  const [editId, setEditId] = useState<string | null>(null);

  const fetchDescuentos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("descuentos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      showAdminToast("Error al cargar descuentos: " + error.message, "error");
    }
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

  useEffect(() => {
    fetchDescuentos();
    fetchCategorias();
  }, [fetchDescuentos, fetchCategorias]);

  const resetWizard = () => {
    setStep(0);
    setNombre("");
    setDescripcion("");
    setPorcentaje(10);
    setFechaInicio(todayARG());
    setFechaFin("");
    setAplicaA("todos");
    setCategoriasIds([]);
    setSubcategoriasIds([]);
    setProductosIds([]);
    setProductosExcluidosIds([]);
    setMarcasIds([]);
    setPresentación("todas");
    setCantidadMinima(null);
    setExcluirCombos(true);
    setClientesIds([]);
    setTipoDescuento("porcentaje");
    setPrecioFijo(null);
    setEditId(null);
    setCatSearch("");
    setExpandedCats([]);
    setProdSearch("");
    setMarcaSearch("");
    setClienteSearch("");
    setSaveError(null);
  };

  const openCreate = () => {
    resetWizard();
    setDialogOpen(true);
  };

  const openEdit = (d: Descuento) => {
    setEditId(d.id);
    setStep(3);
    setNombre(d.nombre);
    setDescripcion(d.descripcion ?? "");
    setPorcentaje(Number(d.porcentaje));
    setFechaInicio(d.fecha_inicio);
    setFechaFin(d.fecha_fin ?? "");
    setAplicaA(d.aplica_a);
    setCategoriasIds(d.categorias_ids ?? []);
    setSubcategoriasIds(d.subcategorias_ids ?? []);
    setProductosIds(d.productos_ids ?? []);
    setProductosExcluidosIds(d.productos_excluidos_ids ?? []);
    setMarcasIds(d.marcas_ids ?? []);
    setClientesIds(d.clientes_ids ?? []);
    setTipoDescuento(d.tipo_descuento || "porcentaje");
    setPrecioFijo(d.precio_fijo ?? null);
    setPresentación(d.presentacion);
    setCantidadMinima(d.cantidad_minima ?? null);
    setExcluirCombos((d as any).excluir_combos ?? true);
    setSaveError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const payload: Record<string, any> = {
      nombre,
      descripcion: descripcion || null,
      porcentaje,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin || null,
      aplica_a: aplicaA,
      categorias_ids: aplicaA === "categorias" ? categoriasIds : [],
      subcategorias_ids: aplicaA === "subcategorias" ? subcategoriasIds : [],
      productos_ids: aplicaA === "productos" ? productosIds : [],
      productos_excluidos_ids: productosExcluidosIds.length > 0 ? productosExcluidosIds : [],
      marcas_ids: marcasIds.length > 0 ? marcasIds : [],
      clientes_ids: clientesIds.length > 0 ? clientesIds : [],
      tipo_descuento: tipoDescuento,
      precio_fijo: tipoDescuento === "precio_fijo" ? precioFijo : null,
      presentacion,
      cantidad_minima: cantidadMinima && cantidadMinima > 0 ? cantidadMinima : null,
      excluir_combos: excluirCombos,
      updated_at: new Date().toISOString(),
    };

    try {
      if (editId) {
        const { error } = await supabase.from("descuentos").update(payload).eq("id", editId);
        if (error) throw error;
        showAdminToast("Descuento actualizado correctamente", "success");
      } else {
        const { error } = await supabase.from("descuentos").insert({ ...payload, activo: true });
        if (error) throw error;
        showAdminToast("Descuento creado correctamente", "success");
      }
      setSaving(false);
      setDialogOpen(false);
      resetWizard();
      fetchDescuentos();
    } catch (err: any) {
      const msg = err.message || "Error al guardar el descuento";
      setSaveError(msg);
      showAdminToast(msg, "error");
      setSaving(false);
    }
  };

  const toggleActivo = async (d: Descuento) => {
    const { error } = await supabase.from("descuentos").update({ activo: !d.activo, updated_at: new Date().toISOString() }).eq("id", d.id);
    if (error) {
      showAdminToast("Error al cambiar estado: " + error.message, "error");
      return;
    }
    fetchDescuentos();
  };

  const handleDelete = (id: string) => {
    setConfirmDialog({
      open: true,
      title: "Eliminar descuento",
      message: "¿Eliminar este descuento?",
      onConfirm: async () => {
        const { error } = await supabase.from("descuentos").delete().eq("id", id);
        if (error) {
          showAdminToast("Error al eliminar: " + error.message, "error");
          return;
        }
        showAdminToast("Descuento eliminado", "success");
        fetchDescuentos();
      },
    });
  };

  // stats
  const today = new Date();
  const totalDescuentos = descuentos.length;
  const activos = descuentos.filter((d) => getEstado(d) === "activo").length;
  const vencidos = descuentos.filter((d) => getEstado(d) === "vencido").length;
  const proximosVencer = descuentos.filter((d) => {
    if (!d.activo || !d.fecha_fin) return false;
    const fin = new Date(d.fecha_fin);
    const diff = (fin.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }).length;

  // category helpers
  const subsForCat = (catId: string) => subcategorias.filter((s) => s.categoria_id === catId);
  const filteredCats = categorias.filter((c) =>
    norm(c.nombre).includes(norm(catSearch))
  );

  const toggleCatExpand = (id: string) => {
    setExpandedCats((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleCatSelect = (id: string) => {
    setCategoriasIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // product helpers
  const filteredProds = productosAll.filter((p) =>
    norm(p.nombre).includes(norm(prodSearch)) ||
    norm(p.codigo).includes(norm(prodSearch))
  );

  const toggleProdSelect = (id: string) => {
    setProductosIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // marca helpers
  const filteredMarcas = marcas.filter((m) =>
    m.nombre.toLowerCase().includes(marcaSearch.toLowerCase())
  );

  const toggleMarcaSelect = (id: string) => {
    setMarcasIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const addDuration = (days: number | null) => {
    if (days === null) {
      setFechaFin("");
      return;
    }
    const d = new Date(fechaInicio);
    d.setDate(d.getDate() + days);
    setFechaFin(d.toISOString().split("T")[0]);
  };

  const canNext = () => {
    if (step === 0) return nombre.trim().length > 0;
    if (step === 1) return tipoDescuento === "precio_fijo" ? (precioFijo != null && precioFijo > 0) : (porcentaje > 0 && porcentaje <= 100);
    if (step === 2) return fechaInicio.length > 0;
    return true;
  };

  // Vigencia display
  const vigenciaDias = fechaInicio && fechaFin ? daysBetween(fechaInicio, fechaFin) : null;

  const aplicaALabel = (v: string) => {
    switch (v) {
      case "todos": return "Todos los productos";
      case "categorias": return "Categorías específicas";
      case "subcategorias": return "Subcategorías específicas";
      case "productos": return "Productos específicos";
      default: return v;
    }
  };

  const presentacionLabel = (v: string) => {
    switch (v) {
      case "todas": return "Todas las presentaciones";
      case "unidad": return "Solo unidad";
      case "caja": return "Solo caja cerrada";
      default: return v;
    }
  };

  // Get marca names for display
  const getMarcaNames = (ids: string[]) => {
    if (!ids || ids.length === 0) return "";
    return ids.map((id) => {
      const m = marcas.find((marca) => marca.id === id);
      return m ? m.nombre : "";
    }).filter(Boolean).join(", ");
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Percent className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Descuentos</h1>
            <p className="text-sm text-muted-foreground">Gestión de descuentos y promociones</p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Crear nuevo descuento
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total descuentos</div>
            <div className="text-2xl font-bold">{totalDescuentos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Activos</div>
            <div className="text-2xl font-bold text-green-600">{activos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Vencidos</div>
            <div className="text-2xl font-bold text-red-600">{vencidos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Próximos a vencer</div>
            <div className="text-2xl font-bold text-amber-600">{proximosVencer}</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : descuentos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No hay descuentos creados</p>
              <Button variant="outline" className="mt-3" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" /> Crear descuento
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Nombre</th>
                    <th className="text-left px-4 py-3 font-medium">Descuento</th>
                    <th className="text-left px-4 py-3 font-medium">Vigencia</th>
                    <th className="text-left px-4 py-3 font-medium">Aplica a</th>
                    <th className="text-left px-4 py-3 font-medium">Marcas</th>
                    <th className="text-left px-4 py-3 font-medium">Presentación</th>
                    <th className="text-right px-4 py-3 font-medium">Cant. Mín.</th>
                    <th className="text-left px-4 py-3 font-medium">Estado</th>
                    <th className="text-right px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {descuentos.map((d) => {
                    const estado = getEstado(d);
                    return (
                      <tr key={d.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{d.nombre}</td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary">
                            {d.tipo_descuento === "precio_fijo" ? (<><DollarSign className="w-3 h-3 mr-1" />{formatCurrency(d.precio_fijo || 0)}</>) : (<><Percent className="w-3 h-3 mr-1" />{Number(d.porcentaje)}%</>)}
                          </Badge>
                          {d.clientes_ids && d.clientes_ids.length > 0 && (
                            <Badge variant="outline" className="ml-1.5 text-blue-600 border-blue-200">
                              <Users className="w-3 h-3 mr-1" />{d.clientes_ids.length}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {d.fecha_fin
                            ? `${formatDate(d.fecha_inicio)} - ${formatDate(d.fecha_fin)}`
                            : "Permanente"}
                        </td>
                        <td className="px-4 py-3 capitalize">{aplicaALabel(d.aplica_a)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {d.marcas_ids && d.marcas_ids.length > 0
                            ? getMarcaNames(d.marcas_ids) || `${d.marcas_ids.length} marca(s)`
                            : "Todas"}
                        </td>
                        <td className="px-4 py-3 capitalize">{presentacionLabel(d.presentacion)}</td>
                        <td className="px-4 py-3 text-right">
                          {d.cantidad_minima ? <Badge variant="outline" className="text-xs">{d.cantidad_minima}+ uds</Badge> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">{estadoBadge(estado)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => toggleActivo(d)}>
                              {d.activo ? (
                                <ToggleRight className="w-4 h-4 text-green-600" />
                              ) : (
                                <ToggleLeft className="w-4 h-4 text-gray-400" />
                              )}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setDialogOpen(false); resetWizard(); } else setDialogOpen(true); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Descuento" : "Crear Nuevo Descuento"}</DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-0 my-4">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                      i < step
                        ? "bg-primary text-primary-foreground border-primary"
                        : i === step
                        ? "border-primary text-primary bg-primary/10"
                        : "border-muted-foreground/30 text-muted-foreground/50"
                    }`}
                  >
                    {i < step ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-[10px] mt-1 ${i === step ? "text-primary font-medium" : "text-muted-foreground/50"}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-12 h-0.5 mx-1 mt-[-12px] ${i < step ? "bg-primary" : "bg-muted-foreground/20"}`} />
                )}
              </div>
            ))}
          </div>

          <Separator />

          {/* Step 1 - Información */}
          {step === 0 && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre del Descuento *</Label>
                <Input
                  id="nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Promo Verano 2026"
                />
                <p className="text-xs text-muted-foreground">Un nombre descriptivo para identificar este descuento.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="descripcion">Descripción (opcional)</Label>
                <textarea
                  id="descripcion"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Detalles adicionales sobre el descuento..."
                />
                <p className="text-xs text-muted-foreground">Información adicional sobre las condiciones del descuento.</p>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setStep(1)} disabled={!canNext()}>
                  Siguiente <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2 - Porcentaje */}
          {step === 1 && (
            <div className="space-y-6 py-4">
              {/* Tipo de descuento toggle */}
              <div className="space-y-2">
                <Label>Tipo de descuento</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setTipoDescuento("porcentaje")}
                    className={`flex flex-col items-center p-4 rounded-lg border-2 transition-colors ${tipoDescuento === "porcentaje" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30"}`}
                  >
                    <Percent className="w-6 h-6 mb-1 text-muted-foreground" />
                    <span className="text-sm font-medium">Porcentaje</span>
                    <span className="text-xs text-muted-foreground">Ej: 20% de descuento</span>
                  </button>
                  <button
                    onClick={() => setTipoDescuento("precio_fijo")}
                    className={`flex flex-col items-center p-4 rounded-lg border-2 transition-colors ${tipoDescuento === "precio_fijo" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30"}`}
                  >
                    <DollarSign className="w-6 h-6 mb-1 text-muted-foreground" />
                    <span className="text-sm font-medium">Precio fijo</span>
                    <span className="text-xs text-muted-foreground">Ej: $5.000 por unidad</span>
                  </button>
                </div>
              </div>

              {tipoDescuento === "porcentaje" ? (<>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-5xl font-bold text-primary">{porcentaje} %</span>
                  <span className="text-sm text-muted-foreground">de descuento</span>
                </div>

                <div className="px-4">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={porcentaje}
                    onChange={(e) => setPorcentaje(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Valor exacto</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={porcentaje}
                      onChange={(e) => setPorcentaje(Math.min(100, Math.max(0, Number(e.target.value))))}
                      className="w-32"
                    />
                    <span className="text-muted-foreground font-medium">%</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Valores rápidos</Label>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_PERCENTS.map((v) => (
                      <Button
                        key={v}
                        variant={porcentaje === v ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPorcentaje(v)}
                      >
                        {v}%
                      </Button>
                    ))}
                  </div>
                </div>
              </>) : (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-5xl font-bold text-primary">{formatCurrency(precioFijo || 0)}</span>
                    <span className="text-sm text-muted-foreground">precio fijo por unidad</span>
                  </div>
                  <div className="space-y-2">
                    <Label>Precio de venta</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-medium">$</span>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={precioFijo ?? ""}
                        onChange={(e) => setPrecioFijo(e.target.value ? Number(e.target.value) : null)}
                        placeholder="Ej: 5000"
                        className="w-48"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                    El precio fijo reemplaza el precio original del producto. Solo se aplica a los productos seleccionados en el paso siguiente.
                  </div>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(0)}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Anterior
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => { setDialogOpen(false); resetWizard(); }}>Cancelar</Button>
                  <Button onClick={() => setStep(2)} disabled={!canNext()}>
                    Siguiente <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 - Vigencia */}
          {step === 2 && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fecha_inicio">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Fecha de Inicio *
                  </Label>
                  <Input
                    id="fecha_inicio"
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fecha_fin">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Fecha de Fin (opcional)
                  </Label>
                  <Input
                    id="fecha_fin"
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                  />
                </div>
              </div>

              {fechaInicio && (
                <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium">
                      Vigencia: {vigenciaDias !== null ? `${vigenciaDias} día(s)` : "Sin límite"}
                    </p>
                    <p className="text-muted-foreground">
                      Desde {formatDate(fechaInicio)}
                      {fechaFin ? ` hasta ${formatDate(fechaFin)}` : " (permanente)"}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Duraciones rápidas</Label>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => addDuration(7)}>
                    <Clock className="w-3 h-3 mr-1" /> 1 semana
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addDuration(14)}>
                    <Clock className="w-3 h-3 mr-1" /> 2 semanas
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addDuration(30)}>
                    <Clock className="w-3 h-3 mr-1" /> 1 mes
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addDuration(90)}>
                    <Clock className="w-3 h-3 mr-1" /> 3 meses
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addDuration(null)}>
                    <Clock className="w-3 h-3 mr-1" /> Sin límite
                  </Button>
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Anterior
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => { setDialogOpen(false); resetWizard(); }}>Cancelar</Button>
                  <Button onClick={() => setStep(3)} disabled={!canNext()}>
                    Siguiente <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4 - Aplicar a */}
          {step === 3 && (
            <div className="space-y-6 py-4">
              {/* Aplica a */}
              <div className="space-y-2">
                <Label>Aplica a</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { value: "todos", label: "Todos los productos", desc: "Aplica a todo el catálogo", icon: Package },
                    { value: "categorias", label: "Categorías", desc: "Seleccioná categorías", icon: Tag },
                    { value: "subcategorias", label: "Subcategorías", desc: "Seleccioná subcategorías", icon: Tag },
                    { value: "productos", label: "Productos específicos", desc: "Seleccioná productos", icon: Search },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setAplicaA(opt.value)}
                      className={`relative flex flex-col items-start p-4 rounded-lg border-2 text-left transition-colors ${
                        aplicaA === opt.value
                          ? "border-primary bg-primary/5"
                          : "border-muted hover:border-muted-foreground/30 cursor-pointer"
                      }`}
                    >
                      {aplicaA === opt.value && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                      <opt.icon className="w-5 h-5 mb-2 text-muted-foreground" />
                      <span className="text-sm font-medium">{opt.label}</span>
                      <span className="text-xs text-muted-foreground">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category tree */}
              {aplicaA === "categorias" && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar categorías..."
                      value={catSearch}
                      onChange={(e) => setCatSearch(e.target.value)}
                    />
                  </div>
                  <div className="border rounded-lg max-h-60 overflow-y-auto divide-y">
                    {filteredCats.map((cat) => {
                      const subs = subsForCat(cat.id);
                      const expanded = expandedCats.includes(cat.id);
                      const selected = categoriasIds.includes(cat.id);
                      return (
                        <div key={cat.id}>
                          <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50">
                            {subs.length > 0 && (
                              <button onClick={() => toggleCatExpand(cat.id)} className="shrink-0">
                                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            )}
                            {subs.length === 0 && <span className="w-4" />}
                            <button
                              onClick={() => toggleCatSelect(cat.id)}
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                selected ? "bg-primary border-primary" : "border-muted-foreground/40"
                              }`}
                            >
                              {selected && <Check className="w-3 h-3 text-primary-foreground" />}
                            </button>
                            <span className="text-sm flex-1">{cat.nombre}</span>
                            {subs.length > 0 && (
                              <span className="text-xs text-muted-foreground">{subs.length} subcategorías</span>
                            )}
                          </div>
                          {expanded && subs.map((sub) => {
                            const subSelected = categoriasIds.includes(sub.id);
                            return (
                              <div key={sub.id} className="flex items-center gap-2 px-3 py-1.5 pl-12 hover:bg-muted/30">
                                <button
                                  onClick={() => toggleCatSelect(sub.id)}
                                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                    subSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
                                  }`}
                                >
                                  {subSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                                </button>
                                <span className="text-sm text-muted-foreground">{sub.nombre}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Subcategory selector */}
              {aplicaA === "subcategorias" && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar subcategorías..."
                      value={catSearch}
                      onChange={(e) => setCatSearch(e.target.value)}
                    />
                  </div>
                  {subcategoriasIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {subcategoriasIds.map((id) => {
                        const sub = subcategorias.find((s) => s.id === id);
                        const parentCat = sub ? categorias.find((c) => c.id === sub.categoria_id) : null;
                        return (
                          <Badge key={id} variant="secondary" className="gap-1 pr-1">
                            {sub ? `${sub.nombre}${parentCat ? ` (${parentCat.nombre})` : ""}` : id}
                            <button
                              onClick={() => setSubcategoriasIds((prev) => prev.filter((x) => x !== id))}
                              className="ml-1 rounded-full hover:bg-muted p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <div className="border rounded-lg max-h-60 overflow-y-auto divide-y">
                    {categorias.map((cat) => {
                      const subs = subcategorias.filter((s) => s.categoria_id === cat.id && s.nombre.toLowerCase().includes(catSearch.toLowerCase()));
                      if (subs.length === 0) return null;
                      return (
                        <div key={cat.id}>
                          <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/30">{cat.nombre}</div>
                          {subs.map((sub) => {
                            const subSelected = subcategoriasIds.includes(sub.id);
                            return (
                              <div
                                key={sub.id}
                                className="flex items-center gap-2 px-3 py-2 pl-6 hover:bg-muted/30 cursor-pointer"
                                onClick={() => setSubcategoriasIds((prev) => prev.includes(sub.id) ? prev.filter((x) => x !== sub.id) : [...prev, sub.id])}
                              >
                                <div
                                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                    subSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
                                  }`}
                                >
                                  {subSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                                </div>
                                <span className="text-sm">{sub.nombre}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {subcategoriasIds.length} subcategoría(s) seleccionada(s)
                  </p>
                </div>
              )}

              {/* Product selector */}
              {aplicaA === "productos" && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar productos por nombre o código..."
                      value={prodSearch}
                      onChange={(e) => setProdSearch(e.target.value)}
                    />
                  </div>
                  {productosIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {productosIds.map((id) => {
                        const prod = productosAll.find((p) => p.id === id);
                        return (
                          <Badge key={id} variant="secondary" className="gap-1 pr-1">
                            {prod ? prod.nombre : id}
                            <button
                              onClick={() => toggleProdSelect(id)}
                              className="ml-1 rounded-full hover:bg-muted p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <div className="border rounded-lg max-h-60 overflow-y-auto divide-y">
                    {filteredProds.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                        No se encontraron productos
                      </div>
                    ) : (
                      filteredProds.map((prod) => {
                        const selected = productosIds.includes(prod.id);
                        return (
                          <div
                            key={prod.id}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                            onClick={() => toggleProdSelect(prod.id)}
                          >
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                selected ? "bg-primary border-primary" : "border-muted-foreground/40"
                              }`}
                            >
                              {selected && <Check className="w-3 h-3 text-primary-foreground" />}
                            </div>
                            <span className="text-sm flex-1">{prod.nombre}</span>
                            <span className="text-xs text-muted-foreground font-mono">{prod.codigo}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {productosIds.length} producto(s) seleccionado(s)
                  </p>
                </div>
              )}

              <Separator />

              {/* Marca selector - combinable with any aplica_a option */}
              <div className="space-y-3">
                <Label>Filtrar por Marca (opcional, combinable)</Label>
                <p className="text-xs text-muted-foreground">
                  Si seleccionás marcas, el descuento solo aplica a productos de esas marcas (combinado con la selección anterior).
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar marcas..."
                    value={marcaSearch}
                    onChange={(e) => setMarcaSearch(e.target.value)}
                  />
                </div>
                {marcasIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {marcasIds.map((id) => {
                      const m = marcas.find((marca) => marca.id === id);
                      return (
                        <Badge key={id} variant="secondary" className="gap-1 pr-1">
                          {m ? m.nombre : id}
                          <button
                            onClick={() => toggleMarcaSelect(id)}
                            className="ml-1 rounded-full hover:bg-muted p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
                <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
                  {filteredMarcas.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                      No se encontraron marcas
                    </div>
                  ) : (
                    filteredMarcas.map((marca) => {
                      const selected = marcasIds.includes(marca.id);
                      return (
                        <div
                          key={marca.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleMarcaSelect(marca.id)}
                        >
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              selected ? "bg-primary border-primary" : "border-muted-foreground/40"
                            }`}
                          >
                            {selected && <Check className="w-3 h-3 text-primary-foreground" />}
                          </div>
                          <span className="text-sm flex-1">{marca.nombre}</span>
                        </div>
                      );
                    })
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {marcasIds.length} marca(s) seleccionada(s){marcasIds.length === 0 ? " (aplica a todas las marcas)" : ""}
                </p>
              </div>

              <Separator />

              {/* Presentación */}
              <div className="space-y-2">
                <Label>Presentación</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { value: "todas", label: "Todas las presentaciones" },
                    { value: "unidad", label: "Solo unidad" },
                    { value: "caja", label: "Solo caja cerrada" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setPresentación(opt.value)}
                      className={`p-3 rounded-lg border-2 text-sm font-medium text-center transition-colors ${
                        presentacion === opt.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-muted hover:border-muted-foreground/30"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cantidad mínima (descuento por volumen) */}
              <div className="space-y-2">
                <Label>Cantidad mínima (opcional)</Label>
                <p className="text-xs text-muted-foreground">Si se define, el descuento solo aplica cuando el cliente compra al menos esta cantidad de unidades del producto.</p>
                <Input
                  type="number"
                  min={0}
                  placeholder="Sin mínimo"
                  value={cantidadMinima ?? ""}
                  onChange={(e) => setCantidadMinima(e.target.value ? Number(e.target.value) : null)}
                  className="w-48"
                />
              </div>

              {/* Excluir combos */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                <div>
                  <p className="text-sm font-medium">Excluir combos</p>
                  <p className="text-xs text-muted-foreground">No aplicar este descuento a productos tipo combo</p>
                </div>
                <button
                  type="button"
                  onClick={() => setExcluirCombos(!excluirCombos)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${excluirCombos ? "bg-primary" : "bg-muted-foreground/30"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${excluirCombos ? "translate-x-5" : ""}`} />
                </button>
              </div>

              {/* Excluir productos específicos */}
              {aplicaA !== "productos" && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Excluir productos específicos</Label>
                  <p className="text-xs text-muted-foreground">Estos productos no recibirán este descuento aunque cumplan las demás condiciones</p>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar producto para excluir..."
                      value={exclSearch}
                      onChange={(e) => setExclSearch(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                  {exclSearch.length >= 2 && (
                    <div className="border rounded-lg max-h-36 overflow-y-auto">
                      {productosAll
                        .filter((p) => p.nombre.toLowerCase().includes(exclSearch.toLowerCase()) && !productosExcluidosIds.includes(p.id))
                        .slice(0, 8)
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-muted/50 text-left"
                            onClick={() => { setProductosExcluidosIds((prev) => [...prev, p.id]); setExclSearch(""); }}
                          >
                            <X className="w-3 h-3 mr-2 text-red-400" />
                            {p.nombre}
                          </button>
                        ))}
                    </div>
                  )}
                  {productosExcluidosIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {productosExcluidosIds.map((id) => {
                        const prod = productosAll.find((p) => p.id === id);
                        return (
                          <Badge key={id} variant="secondary" className="gap-1 pr-1 bg-red-50 text-red-700 border-red-200">
                            {prod?.nombre || id.slice(0, 8)}
                            <button type="button" onClick={() => setProductosExcluidosIds((prev) => prev.filter((x) => x !== id))} className="hover:bg-red-200 rounded-full p-0.5">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Clientes exclusivos (opcional) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Clientes exclusivos</Label>
                  <span className="text-xs text-muted-foreground">(opcional)</span>
                </div>
                <p className="text-xs text-muted-foreground">Si seleccionás clientes, el descuento solo aplica a ellos. Si no seleccionás ninguno, aplica a todos.</p>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente por nombre o CUIT..."
                    value={clienteSearch}
                    onChange={(e) => setClienteSearch(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
                {clienteSearch.length >= 2 && (
                  <div className="border rounded-lg max-h-36 overflow-y-auto">
                    {clientesAll
                      .filter((c) => (norm(c.nombre).includes(norm(clienteSearch)) || (c.cuit && c.cuit.includes(clienteSearch))) && !clientesIds.includes(c.id))
                      .slice(0, 8)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-muted/50 text-left"
                          onClick={() => { setClientesIds((prev) => [...prev, c.id]); setClienteSearch(""); }}
                        >
                          <Users className="w-3 h-3 mr-2 text-blue-400" />
                          <span>{c.nombre}</span>
                          {c.cuit && <span className="ml-auto text-xs text-muted-foreground">{c.cuit}</span>}
                        </button>
                      ))}
                    {clientesAll.filter((c) => (norm(c.nombre).includes(norm(clienteSearch)) || (c.cuit && c.cuit.includes(clienteSearch))) && !clientesIds.includes(c.id)).length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground text-center">Sin resultados</p>
                    )}
                  </div>
                )}
                {clientesIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {clientesIds.map((id) => {
                      const c = clientesAll.find((cl) => cl.id === id);
                      return (
                        <Badge key={id} variant="secondary" className="gap-1 pr-1 bg-blue-50 text-blue-700 border-blue-200">
                          {c?.nombre || id.slice(0, 8)}
                          <button type="button" onClick={() => setClientesIds((prev) => prev.filter((x) => x !== id))} className="hover:bg-blue-200 rounded-full p-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>

              <Separator />

              {/* Resumen */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">Resumen del descuento</Label>
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nombre</span>
                    <span className="font-medium">{nombre || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Descuento</span>
                    <span className="font-medium">{tipoDescuento === "precio_fijo" ? formatCurrency(precioFijo || 0) + " (precio fijo)" : porcentaje + "%"}</span>
                  </div>
                  {clientesIds.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Clientes</span>
                      <span className="font-medium">{clientesIds.length} cliente{clientesIds.length !== 1 ? "s" : ""} exclusivo{clientesIds.length !== 1 ? "s" : ""}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Desde</span>
                    <span className="font-medium">{fechaInicio ? formatDate(fechaInicio) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hasta</span>
                    <span className="font-medium">{fechaFin ? formatDate(fechaFin) : "Sin límite"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Aplica a</span>
                    <span className="font-medium">
                      {aplicaALabel(aplicaA)}
                      {aplicaA === "categorias" && categoriasIds.length > 0 && ` (${categoriasIds.length})`}
                      {aplicaA === "subcategorias" && subcategoriasIds.length > 0 && ` (${subcategoriasIds.length})`}
                      {aplicaA === "productos" && productosIds.length > 0 && ` (${productosIds.length})`}
                    </span>
                  </div>
                  {productosExcluidosIds.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Excluidos</span>
                      <span className="font-medium text-red-600">{productosExcluidosIds.length} productos</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Marcas</span>
                    <span className="font-medium">
                      {marcasIds.length > 0
                        ? `${marcasIds.map((id) => marcas.find((m) => m.id === id)?.nombre || "").filter(Boolean).join(", ")}`
                        : "Todas"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Presentación</span>
                    <span className="font-medium">{presentacionLabel(presentacion)}</span>
                  </div>
                </div>
              </div>

              {/* Error message */}
              {saveError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 flex items-start gap-2 text-sm text-red-700 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{saveError}</span>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Anterior
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => { setDialogOpen(false); resetWizard(); }}>Cancelar</Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editId ? "Guardar Cambios" : "Crear Descuento"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
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
