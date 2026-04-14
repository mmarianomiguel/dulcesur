"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { showAdminToast } from "@/components/admin-toast";
import type { NotificacionPlantilla } from "@/types/database";

const TIPOS = [
  { value: "pedido", label: "Pedido" },
  { value: "promocion", label: "Promoción" },
  { value: "recordatorio", label: "Recordatorio" },
  { value: "catalogo", label: "Catálogo" },
  { value: "cuenta_corriente", label: "Cuenta Corriente" },
  { value: "sistema", label: "Sistema" },
];

const DESTINATARIOS = [
  { value: "cliente", label: "Cliente" },
  { value: "admin", label: "Admin" },
  { value: "vendedor", label: "Vendedor" },
  { value: "todos", label: "Todos" },
];

const TIPO_COLORS: Record<string, string> = {
  pedido: "bg-blue-100 text-blue-700",
  promocion: "bg-green-100 text-green-700",
  recordatorio: "bg-amber-100 text-amber-700",
  catalogo: "bg-purple-100 text-purple-700",
  cuenta_corriente: "bg-rose-100 text-rose-700",
  sistema: "bg-gray-100 text-gray-700",
};

const DEST_LABELS: Record<string, string> = {
  cliente: "Clientes",
  admin: "Admins",
  vendedor: "Vendedores",
  todos: "Todos",
};

const EMPTY: Partial<NotificacionPlantilla> = {
  nombre: "",
  titulo_template: "",
  mensaje_template: "",
  tipo: "pedido",
  destinatario_default: "cliente",
  activa: true,
  variables_disponibles: [],
};

export default function PlantillasPage() {
  const [plantillas, setPlantillas] = useState<NotificacionPlantilla[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<NotificacionPlantilla>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [varInput, setVarInput] = useState("");
  const tituloRef = useRef<HTMLInputElement>(null);
  const mensajeRef = useRef<HTMLTextAreaElement>(null);

  const fetchPlantillas = useCallback(async () => {
    try {
      const res = await fetch("/api/notificaciones/plantillas");
      const data = await res.json();
      setPlantillas(data);
    } catch {
      showAdminToast("Error al cargar plantillas", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlantillas(); }, [fetchPlantillas]);

  const handleSave = async () => {
    if (!editing.nombre || !editing.titulo_template || !editing.mensaje_template) {
      showAdminToast("Completá nombre, título y mensaje", "error");
      return;
    }
    setSaving(true);
    try {
      const method = editing.id ? "PUT" : "POST";
      const res = await fetch("/api/notificaciones/plantillas", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (!res.ok) throw new Error("Error al guardar");
      showAdminToast(editing.id ? "Plantilla actualizada" : "Plantilla creada", "success");
      setDialogOpen(false);
      setEditing(EMPTY);
      fetchPlantillas();
    } catch {
      showAdminToast("Error al guardar plantilla", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (p: NotificacionPlantilla) => {
    try {
      await fetch("/api/notificaciones/plantillas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, activa: !p.activa }),
      });
      setPlantillas((prev) => prev.map((x) => (x.id === p.id ? { ...x, activa: !x.activa } : x)));
    } catch {
      showAdminToast("Error al cambiar estado", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await fetch("/api/notificaciones/plantillas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteId }),
      });
      showAdminToast("Plantilla eliminada", "success");
      setDeleteId(null);
      fetchPlantillas();
    } catch {
      showAdminToast("Error al eliminar", "error");
    }
  };

  const insertVariable = (variable: string, target: "titulo" | "mensaje") => {
    const tag = `{{${variable}}}`;
    if (target === "titulo") {
      const el = tituloRef.current;
      if (el) {
        const start = el.selectionStart ?? el.value.length;
        const val = el.value;
        const newVal = val.slice(0, start) + tag + val.slice(start);
        setEditing((e) => ({ ...e, titulo_template: newVal }));
        setTimeout(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length); }, 0);
      }
    } else {
      const el = mensajeRef.current;
      if (el) {
        const start = el.selectionStart ?? el.value.length;
        const val = el.value;
        const newVal = val.slice(0, start) + tag + val.slice(start);
        setEditing((e) => ({ ...e, mensaje_template: newVal }));
        setTimeout(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length); }, 0);
      }
    }
  };

  const addVariable = () => {
    const v = varInput.trim().toLowerCase().replace(/\s+/g, "_");
    if (!v) return;
    if (editing.variables_disponibles?.includes(v)) return;
    setEditing((e) => ({ ...e, variables_disponibles: [...(e.variables_disponibles || []), v] }));
    setVarInput("");
  };

  const removeVariable = (v: string) => {
    setEditing((e) => ({ ...e, variables_disponibles: (e.variables_disponibles || []).filter((x) => x !== v) }));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">Plantillas</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">Mensajes predefinidos reutilizables</p>
          </div>
        </div>
        <Button size="sm" onClick={() => { setEditing(EMPTY); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Nueva plantilla</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : plantillas.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
            <FileText className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium text-muted-foreground">No hay plantillas</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Creá tu primera plantilla de notificación</p>
          <Button size="sm" className="mt-4" onClick={() => { setEditing(EMPTY); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Crear plantilla
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {plantillas.map((p) => (
            <div
              key={p.id}
              className={`bg-white dark:bg-gray-900 border rounded-xl p-4 transition-all ${!p.activa ? "opacity-50" : ""}`}
            >
              {/* Top row: nombre + acciones */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{p.nombre}</span>
                    <Badge className={`${TIPO_COLORS[p.tipo] || ""} text-[10px] px-1.5 py-0`}>
                      {TIPOS.find((t) => t.value === p.tipo)?.label || p.tipo}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {DEST_LABELS[p.destinatario_default] || p.destinatario_default}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch checked={p.activa} onCheckedChange={() => handleToggle(p)} />
                  <button
                    onClick={() => { setEditing(p); setDialogOpen(true); }}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setDeleteId(p.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </div>
              </div>

              {/* Preview del mensaje */}
              <div className="mt-3 bg-muted/50 rounded-lg p-2.5">
                <div className="text-xs font-semibold text-foreground truncate">{p.titulo_template}</div>
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.mensaje_template}</div>
              </div>

              {/* Variables */}
              {(p.variables_disponibles || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {(p.variables_disponibles as string[]).map((v: string) => (
                    <span
                      key={v}
                      className="text-[10px] font-mono bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing.id ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Nombre</Label>
              <Input value={editing.nombre || ""} onChange={(e) => setEditing((x) => ({ ...x, nombre: e.target.value }))} placeholder="Ej: Pedido en camino" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={editing.tipo || "pedido"} onValueChange={(v) => setEditing((x) => ({ ...x, tipo: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Destinatario</Label>
                <Select value={editing.destinatario_default || "cliente"} onValueChange={(v) => setEditing((x) => ({ ...x, destinatario_default: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DESTINATARIOS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Variables disponibles</Label>
              <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                {(editing.variables_disponibles || []).map((v) => (
                  <Badge key={v} variant="secondary" className="cursor-pointer gap-1 pr-1 font-mono text-xs">
                    {`{{${v}}}`}
                    <button onClick={() => removeVariable(v)} className="ml-0.5 hover:text-red-500"><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={varInput} onChange={(e) => setVarInput(e.target.value)} placeholder="nombre de variable" className="flex-1"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVariable(); } }} />
                <Button variant="outline" size="sm" onClick={addVariable}>Agregar</Button>
              </div>
            </div>
            <div>
              <Label>Título</Label>
              <Input ref={tituloRef} value={editing.titulo_template || ""} onChange={(e) => setEditing((x) => ({ ...x, titulo_template: e.target.value }))} placeholder="Ej: Tu pedido #{{numero}} está en camino" />
              {(editing.variables_disponibles || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {(editing.variables_disponibles || []).map((v) => (
                    <button key={v} onClick={() => insertVariable(v, "titulo")}
                      className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md hover:bg-primary/20 transition-colors font-mono">
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Mensaje</Label>
              <Textarea ref={mensajeRef} value={editing.mensaje_template || ""} onChange={(e) => setEditing((x) => ({ ...x, mensaje_template: e.target.value }))} placeholder="Ej: Hola {{cliente}}, tu pedido..." rows={3} />
              {(editing.variables_disponibles || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {(editing.variables_disponibles || []).map((v) => (
                    <button key={v} onClick={() => insertVariable(v, "mensaje")}
                      className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md hover:bg-primary/20 transition-colors font-mono">
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editing.activa ?? true} onCheckedChange={(v) => setEditing((x) => ({ ...x, activa: v }))} />
              <Label>Activa</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editing.id ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar plantilla?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
