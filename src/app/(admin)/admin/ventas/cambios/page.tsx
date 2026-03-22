"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { todayARG } from "@/lib/formatters";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  Plus,
  Search,
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
  Loader2,
  CalendarDays,
} from "lucide-react";

interface CambioRow {
  id: string;
  numero: string;
  fecha: string;
  cliente_id: string | null;
  observacion: string | null;
  clientes?: { nombre: string } | null;
  cambio_items?: CambioItem[];
}

interface CambioItem {
  id: string;
  cambio_id: string;
  producto_id: string;
  tipo: "entrada" | "salida";
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  productos?: { nombre: string };
}

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  stock: number;
  precio: number;
}

interface Cliente {
  id: string;
  nombre: string;
}

interface ItemLine {
  key: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);
}

export default function CambiosPage() {
  const currentUser = useCurrentUser();
  const [cambios, setCambios] = useState<CambioRow[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [presMap, setPresMap] = useState<Record<string, { codigo: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nuevoClienteId, setNuevoClienteId] = useState("");
  const [nuevoObservacion, setNuevoObservacion] = useState("");
  const [itemsSalida, setItemsSalida] = useState<ItemLine[]>([]);
  const [itemsEntrada, setItemsEntrada] = useState<ItemLine[]>([]);
  const [searchSalida, setSearchSalida] = useState("");
  const [searchEntrada, setSearchEntrada] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: cmbs }, { data: cls }, { data: prds }] = await Promise.all([
      supabase
        .from("cambios_articulos")
        .select("*, clientes(nombre), cambio_items(*, productos(nombre))")
        .order("fecha", { ascending: false }),
      supabase.from("clientes").select("id, nombre").eq("activo", true).order("nombre"),
      supabase
        .from("productos")
        .select("id, codigo, nombre, stock, precio")
        .eq("activo", true)
        .order("nombre"),
    ]);
    setCambios(cmbs || []);
    setClientes(cls || []);
    setProductos(prds || []);
    const { data: allPres } = await supabase.from("presentaciones").select("producto_id, sku");
    if (allPres) {
      const map: Record<string, { codigo: string }[]> = {};
      for (const pr of allPres) { if (!map[pr.producto_id]) map[pr.producto_id] = []; map[pr.producto_id].push({ codigo: pr.sku || "" }); }
      setPresMap(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const now = new Date();
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const cambiosMes = cambios.filter((c) => c.fecha.startsWith(mesActual)).length;

  const filtered = cambios.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (c.clientes?.nombre || "").toLowerCase().includes(s) ||
      c.numero.toLowerCase().includes(s)
    );
  });

  const countItems = (cambio: CambioRow, tipo: "entrada" | "salida") =>
    (cambio.cambio_items || []).filter((i) => i.tipo === tipo).length;

  const addItem = (
    tipo: "salida" | "entrada",
    producto: Producto
  ) => {
    const line: ItemLine = {
      key: crypto.randomUUID(),
      producto_id: producto.id,
      nombre: producto.nombre,
      cantidad: 1,
      precio_unitario: producto.precio,
      subtotal: producto.precio,
    };
    if (tipo === "salida") {
      setItemsSalida((prev) => [...prev, line]);
      setSearchSalida("");
    } else {
      setItemsEntrada((prev) => [...prev, line]);
      setSearchEntrada("");
    }
  };

  const updateItem = (
    tipo: "salida" | "entrada",
    key: string,
    field: "cantidad" | "precio_unitario",
    value: number
  ) => {
    const setter = tipo === "salida" ? setItemsSalida : setItemsEntrada;
    setter((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item;
        const updated = { ...item, [field]: value };
        updated.subtotal = updated.cantidad * updated.precio_unitario;
        return updated;
      })
    );
  };

  const removeItem = (tipo: "salida" | "entrada", key: string) => {
    const setter = tipo === "salida" ? setItemsSalida : setItemsEntrada;
    setter((prev) => prev.filter((i) => i.key !== key));
  };

  const totalSalida = itemsSalida.reduce((s, i) => s + i.subtotal, 0);
  const totalEntrada = itemsEntrada.reduce((s, i) => s + i.subtotal, 0);
  const diferencia = totalEntrada - totalSalida;

  const filteredProductos = (q: string) =>
    q.length < 1
      ? []
      : productos.filter(
          (p) =>
            p.nombre.toLowerCase().includes(q.toLowerCase()) ||
            p.codigo.toLowerCase().includes(q.toLowerCase()) ||
            (presMap[p.id] || []).some((pr) => (pr.codigo || "").toLowerCase().includes(q.toLowerCase()))
        ).slice(0, 8);

  const handleGuardar = async () => {
    if (itemsSalida.length === 0 && itemsEntrada.length === 0) return;
    setSaving(true);
    try {
      const { data: numData } = await supabase.rpc("next_numero", { p_tipo: "cambio" });
      const numero = numData as string;
      const fecha = todayARG();

      const { data: cambio, error } = await supabase
        .from("cambios_articulos")
        .insert({
          numero,
          fecha,
          cliente_id: nuevoClienteId || null,
          observacion: nuevoObservacion || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Insert all items
      const allItems = [
        ...itemsSalida.map((i) => ({
          cambio_id: cambio.id,
          producto_id: i.producto_id,
          tipo: "salida" as const,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          subtotal: i.subtotal,
        })),
        ...itemsEntrada.map((i) => ({
          cambio_id: cambio.id,
          producto_id: i.producto_id,
          tipo: "entrada" as const,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          subtotal: i.subtotal,
        })),
      ];

      if (allItems.length > 0) {
        const { error: itemsError } = await supabase
          .from("cambio_items")
          .insert(allItems);
        if (itemsError) throw itemsError;
      }

      const usuario = currentUser?.nombre || "Admin Sistema";

      // Adjust stock: entrada (client returns) => stock += cantidad
      for (const item of itemsEntrada) {
        const { data: prod } = await supabase.from("productos").select("stock").eq("id", item.producto_id).single();
        const stockAntes = prod?.stock ?? 0;
        const stockDespues = stockAntes + item.cantidad;
        await supabase.from("productos").update({ stock: stockDespues }).eq("id", item.producto_id);
        await supabase.from("stock_movimientos").insert({
          producto_id: item.producto_id,
          tipo: "devolucion",
          cantidad_antes: stockAntes,
          cantidad_despues: stockDespues,
          cantidad: item.cantidad,
          referencia: `Cambio #${numero} (entrada)`,
          usuario,
          orden_id: cambio.id,
          reference_type: "cambio",
        });
      }

      // Adjust stock: salida (client takes) => stock -= cantidad
      for (const item of itemsSalida) {
        const { data: prod } = await supabase.from("productos").select("stock").eq("id", item.producto_id).single();
        const stockAntes = prod?.stock ?? 0;
        const stockDespues = stockAntes - item.cantidad;
        await supabase.from("productos").update({ stock: stockDespues }).eq("id", item.producto_id);
        await supabase.from("stock_movimientos").insert({
          producto_id: item.producto_id,
          tipo: "Venta",
          cantidad_antes: stockAntes,
          cantidad_despues: stockDespues,
          cantidad: -item.cantidad,
          referencia: `Cambio #${numero} (salida)`,
          usuario,
          orden_id: cambio.id,
          reference_type: "cambio",
        });
      }

      setDialogOpen(false);
      resetDialog();
      fetchData();
    } catch (err) {
      console.error("Error creando cambio:", err);
    } finally {
      setSaving(false);
    }
  };

  const resetDialog = () => {
    setNuevoClienteId("");
    setNuevoObservacion("");
    setItemsSalida([]);
    setItemsEntrada([]);
    setSearchSalida("");
    setSearchEntrada("");
  };

  const ItemSection = ({
    title,
    icon,
    tipo,
    items,
    searchValue,
    onSearchChange,
  }: {
    title: string;
    icon: React.ReactNode;
    tipo: "salida" | "entrada";
    items: ItemLine[];
    searchValue: string;
    onSearchChange: (v: string) => void;
  }) => (
    <div className="flex-1 min-w-0 space-y-3">
      <div className="flex items-center gap-2 font-medium text-sm">
        {icon}
        {title}
      </div>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <Input
          placeholder="Buscar producto..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-7 h-8 text-sm"
        />
        {searchValue && filteredProductos(searchValue).length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-lg max-h-40 overflow-y-auto">
            {filteredProductos(searchValue).map((p) => (
              <button
                key={p.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                onClick={() => addItem(tipo, p)}
              >
                <span className="font-mono text-xs text-muted-foreground mr-2">
                  {p.codigo}
                </span>
                {p.nombre}
                <span className="text-xs text-muted-foreground ml-2">
                  (Stock: {p.stock})
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2 min-h-[100px]">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Sin artículos
          </p>
        )}
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center gap-2 p-2 border rounded text-sm"
          >
            <div className="flex-1 truncate text-xs">{item.nombre}</div>
            <Input
              type="number"
              className="w-16 h-7 text-xs"
              value={item.cantidad}
              min={1}
              onChange={(e) =>
                updateItem(tipo, item.key, "cantidad", parseInt(e.target.value) || 1)
              }
            />
            <Input
              type="number"
              className="w-20 h-7 text-xs"
              value={item.precio_unitario}
              onChange={(e) =>
                updateItem(
                  tipo,
                  item.key,
                  "precio_unitario",
                  parseFloat(e.target.value) || 0
                )
              }
            />
            <span className="text-xs font-medium w-20 text-right">
              {formatCurrency(item.subtotal)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => removeItem(tipo, item.key)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
      <div className="text-right text-sm font-medium">
        Subtotal: {formatCurrency(tipo === "salida" ? totalSalida : totalEntrada)}
      </div>
    </div>
  );

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Cambio de Artículos</h1>
          <p className="text-muted-foreground">
            Gestión de cambios y devoluciones de productos
          </p>
        </div>
        <Button
          onClick={() => {
            resetDialog();
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Cambio
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Cambios</CardTitle>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cambios.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cambios este Mes</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cambiosMes}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por cliente o número..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Número</th>
                  <th className="text-left p-3 font-medium">Fecha</th>
                  <th className="text-left p-3 font-medium">Cliente</th>
                  <th className="text-center p-3 font-medium">Salida</th>
                  <th className="text-center p-3 font-medium">Entrada</th>
                  <th className="text-left p-3 font-medium">Observación</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No se encontraron cambios
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-mono">{c.numero}</td>
                      <td className="p-3">{c.fecha}</td>
                      <td className="p-3">{c.clientes?.nombre || "-"}</td>
                      <td className="p-3 text-center">
                        <Badge variant="outline" className="bg-red-50 text-red-700">
                          <ArrowUpRight className="h-3 w-3 mr-1" />
                          {countItems(c, "salida")}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                          <ArrowDownLeft className="h-3 w-3 mr-1" />
                          {countItems(c, "entrada")}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground max-w-[200px] truncate">
                        {c.observacion || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Nuevo Cambio Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Nuevo Cambio de Artículos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto max-h-[70vh]">
            <div className="space-y-2">
              <Label>Cliente (opcional)</Label>
              <Select value={nuevoClienteId} onValueChange={(v) => setNuevoClienteId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <ItemSection
                title="Artículos que salen"
                icon={<ArrowUpRight className="h-4 w-4 text-red-600" />}
                tipo="salida"
                items={itemsSalida}
                searchValue={searchSalida}
                onSearchChange={setSearchSalida}
              />
              <ItemSection
                title="Artículos que entran"
                icon={<ArrowDownLeft className="h-4 w-4 text-green-600" />}
                tipo="entrada"
                items={itemsEntrada}
                searchValue={searchEntrada}
                onSearchChange={setSearchEntrada}
              />
            </div>

            <div className="text-center p-3 bg-muted rounded-lg">
              <span className="text-sm text-muted-foreground">Diferencia: </span>
              <span
                className={`font-bold ${
                  diferencia > 0
                    ? "text-red-600"
                    : diferencia < 0
                    ? "text-green-600"
                    : ""
                }`}
              >
                {formatCurrency(Math.abs(diferencia))}
                {diferencia > 0
                  ? " (Cliente paga)"
                  : diferencia < 0
                  ? " (A favor del cliente)"
                  : ""}
              </span>
            </div>

            <div className="space-y-2">
              <Label>Observación</Label>
              <Textarea
                placeholder="Observaciones (opcional)"
                value={nuevoObservacion}
                onChange={(e) => setNuevoObservacion(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleGuardar}
                disabled={
                  saving ||
                  (itemsSalida.length === 0 && itemsEntrada.length === 0)
                }
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Guardar Cambio
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
