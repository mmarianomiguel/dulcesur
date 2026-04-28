"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderOpen,
  Star,
  Loader2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Plus,
  GripVertical,
} from "lucide-react";

interface CategoriaDestacada {
  id: string;
  categoria_id: string;
  orden: number;
  categoria?: { id: string; nombre: string };
}

interface Categoria {
  id: string;
  nombre: string;
}

export default function CatalogoConfigPage() {
  const [maxCategorias, setMaxCategorias] = useState(0);
  const [configId, setConfigId] = useState<string | null>(null);
  const [destacadas, setDestacadas] = useState<CategoriaDestacada[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [selectedCatId, setSelectedCatId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: cfg }, { data: dest }, { data: cats }] = await Promise.all([
      supabase
        .from("tienda_config")
        .select("id, max_categorias_destacadas")
        .limit(1)
        .single(),
      supabase
        .from("categorias_destacadas")
        .select("*, categoria:categorias(id, nombre)")
        .order("orden"),
      supabase.from("categorias").select("id, nombre").order("nombre"),
    ]);
    if (cfg) {
      setConfigId(cfg.id);
      setMaxCategorias(cfg.max_categorias_destacadas ?? 0);
    }
    // Deduplicate by categoria_id (keep first occurrence, preserve order)
    const seen = new Set<string>();
    const deduped = ((dest as CategoriaDestacada[]) || []).filter((d) => {
      if (seen.has(d.categoria_id)) return false;
      seen.add(d.categoria_id);
      return true;
    });
    setDestacadas(deduped);
    setCategorias((cats as Categoria[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addDestacada = () => {
    if (!selectedCatId) return;
    if (destacadas.length >= maxCategorias) return;
    if (destacadas.some((d) => d.categoria_id === selectedCatId)) return;
    const cat = categorias.find((c) => c.id === selectedCatId);
    if (!cat) return;
    setDestacadas([
      ...destacadas,
      {
        id: `new-${Date.now()}`,
        categoria_id: selectedCatId,
        orden: destacadas.length + 1,
        categoria: cat,
      },
    ]);
    setSelectedCatId("");
  };

  const removeDestacada = (catId: string) => {
    setDestacadas(
      destacadas
        .filter((d) => d.categoria_id !== catId)
        .map((d, i) => ({ ...d, orden: i + 1 }))
    );
  };

  const moveDestacada = (index: number, direction: "up" | "down") => {
    const newList = [...destacadas];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newList.length) return;
    [newList[index], newList[swapIndex]] = [newList[swapIndex], newList[index]];
    setDestacadas(newList.map((d, i) => ({ ...d, orden: i + 1 })));
  };

  const save = async () => {
    if (!configId) return;
    setSaving(true);

    await supabase
      .from("tienda_config")
      .update({ max_categorias_destacadas: maxCategorias })
      .eq("id", configId);

    // Sync categorias_destacadas: delete all and re-insert
    await supabase.from("categorias_destacadas").delete().neq("id", "");

    if (destacadas.length > 0) {
      await supabase.from("categorias_destacadas").insert(
        destacadas.map((d, i) => ({
          categoria_id: d.categoria_id,
          orden: i + 1,
        }))
      );
    }

    setSaving(false);
    showAdminToast("Catálogo guardado");
  };

  const availableCats = categorias.filter(
    (c) => !destacadas.some((d) => d.categoria_id === c.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 pb-24 space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
          <FolderOpen className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Catálogo
          </h1>
          <p className="text-sm text-muted-foreground">
            Categorías destacadas y orden de presentación
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Max categories config */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Máximo de categorías</p>
                <p className="text-xs text-muted-foreground">
                  Cantidad máxima de categorías destacadas en la tienda
                </p>
              </div>
              <Input
                type="number"
                className="w-20 h-9 text-center"
                value={maxCategorias}
                onChange={(e) => setMaxCategorias(Number(e.target.value))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Category List */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Categorías seleccionadas</CardTitle>
                <CardDescription>
                  Categorías que se muestran en la página principal
                </CardDescription>
              </div>
              <Badge variant="secondary" className="font-mono">
                {destacadas.length} de {maxCategorias}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {destacadas.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Star className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No hay categorías destacadas</p>
                <p className="text-xs">Agrega una categoría desde el selector de abajo</p>
              </div>
            )}

            {destacadas.map((d, i) => (
              <div
                key={d.categoria_id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(i)); e.currentTarget.classList.add("opacity-50"); }}
                onDragEnd={(e) => { e.currentTarget.classList.remove("opacity-50"); }}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary"); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove("border-primary"); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("border-primary");
                  const from = Number(e.dataTransfer.getData("text/plain"));
                  if (from === i || isNaN(from)) return;
                  const list = [...destacadas];
                  const [moved] = list.splice(from, 1);
                  list.splice(i, 0, moved);
                  setDestacadas(list.map((d, idx) => ({ ...d, orden: idx + 1 })));
                }}
                className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:shadow-sm transition-all group cursor-grab active:cursor-grabbing"
              >
                <div className="text-muted-foreground/40">
                  <GripVertical className="w-4 h-4" />
                </div>
                <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm font-medium flex-1">
                  {d.categoria?.nombre || d.categoria_id}
                </span>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveDestacada(i, "up")}
                    disabled={i === 0}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveDestacada(i, "down")}
                    disabled={i === destacadas.length - 1}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeDestacada(d.categoria_id)}
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            <Separator />

            {/* Add Category */}
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1">
                <Select
                  value={selectedCatId}
                  onValueChange={(v) => setSelectedCatId(v ?? "")}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seleccionar categoría..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCats.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={addDestacada}
                disabled={
                  !selectedCatId ||
                  destacadas.length >= maxCategorias
                }
                className="h-9 gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sticky Save Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-end px-6 lg:px-8 py-3">
          <Button onClick={save} disabled={saving} className="min-w-[160px]">
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Guardar cambios
          </Button>
        </div>
      </div>
    </div>
  );
}
