"use client";

import { useEffect, useState, useCallback } from "react";
import { todayARG, formatCurrency } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Plus,
  Search,
  Download,
  FileText,
  Receipt,
  Percent,
  Loader2,
} from "lucide-react";

interface Percepcion {
  id: string;
  venta_id: string;
  tipo: "IIBB" | "IVA";
  jurisdiccion: string;
  alicuota: number;
  base_imponible: number;
  monto: number;
  ventas?: {
    numero: string;
    fecha: string;
    cliente_id: string;
    total: number;
    clientes?: { nombre: string };
  };
}

interface Venta {
  id: string;
  numero: string;
  fecha: string;
  total: number;
  cliente_id: string;
  clientes?: { nombre: string };
}

export default function PercepcionesPage() {
  const [percepciones, setPercepciones] = useState<Percepcion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroJurisdiccion, setFiltroJurisdiccion] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ventaSearch, setVentaSearch] = useState("");
  const [ventasResult, setVentasResult] = useState<Venta[]>([]);
  const [selectedVenta, setSelectedVenta] = useState<Venta | null>(null);
  const [nuevoTipo, setNuevoTipo] = useState<"IIBB" | "IVA">("IIBB");
  const [nuevoJurisdiccion, setNuevoJurisdiccion] = useState("");
  const [nuevoAlicuota, setNuevoAlicuota] = useState("");
  const [nuevoBase, setNuevoBase] = useState("");
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [searchingVentas, setSearchingVentas] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("percepciones")
      .select("*, ventas(numero, fecha, total, cliente_id, clientes(nombre))")
      .order("id", { ascending: false });
    setPercepciones(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const now = new Date();
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const percepcionesMes = percepciones.filter(
    (p) => p.ventas?.fecha?.startsWith(mesActual)
  );
  const montoIIBB = percepcionesMes
    .filter((p) => p.tipo === "IIBB")
    .reduce((s, p) => s + p.monto, 0);
  const montoIVA = percepcionesMes
    .filter((p) => p.tipo === "IVA")
    .reduce((s, p) => s + p.monto, 0);

  const filtered = percepciones.filter((p) => {
    if (filtroTipo !== "todos" && p.tipo !== filtroTipo) return false;
    if (
      filtroJurisdiccion &&
      !p.jurisdiccion.toLowerCase().includes(filtroJurisdiccion.toLowerCase())
    )
      return false;
    const fecha = p.ventas?.fecha || "";
    if (fechaDesde && fecha < fechaDesde) return false;
    if (fechaHasta && fecha > fechaHasta) return false;
    return true;
  });

  const searchVentas = async (q: string) => {
    setVentaSearch(q);
    if (q.length < 2) {
      setVentasResult([]);
      return;
    }
    setSearchingVentas(true);
    const { data } = await supabase
      .from("ventas")
      .select("id, numero, fecha, total, cliente_id, clientes(nombre)")
      .ilike("numero", `%${q}%`)
      .order("fecha", { ascending: false })
      .limit(10);
    setVentasResult((data as unknown as Venta[]) || []);
    setSearchingVentas(false);
  };

  const selectVenta = (v: Venta) => {
    setSelectedVenta(v);
    setNuevoBase(String(v.total));
    setVentaSearch(v.numero);
    setVentasResult([]);
    recalcMonto(String(v.total), nuevoAlicuota);
  };

  const recalcMonto = (base: string, alicuota: string) => {
    const b = parseFloat(base) || 0;
    const a = parseFloat(alicuota) || 0;
    setNuevoMonto(String(Math.round((b * a) / 100 * 100) / 100));
  };

  const handleGuardar = async () => {
    if (!selectedVenta || !nuevoJurisdiccion || !nuevoAlicuota) return;
    setSaving(true);
    try {
      await supabase.from("percepciones").insert({
        venta_id: selectedVenta.id,
        tipo: nuevoTipo,
        jurisdiccion: nuevoJurisdiccion,
        alicuota: parseFloat(nuevoAlicuota),
        base_imponible: parseFloat(nuevoBase),
        monto: parseFloat(nuevoMonto),
      });
      setDialogOpen(false);
      resetDialog();
      fetchData();
    } catch (err) {
      console.error("Error creando percepción:", err);
    } finally {
      setSaving(false);
    }
  };

  const resetDialog = () => {
    setVentaSearch("");
    setVentasResult([]);
    setSelectedVenta(null);
    setNuevoTipo("IIBB");
    setNuevoJurisdiccion("");
    setNuevoAlicuota("");
    setNuevoBase("");
    setNuevoMonto("");
  };

  const exportCSV = () => {
    const headers = [
      "Fecha",
      "Comprobante",
      "Cliente",
      "Tipo",
      "Jurisdicción",
      "Alícuota %",
      "Base Imponible",
      "Monto Percepción",
    ];
    const rows = filtered.map((p) => [
      p.ventas?.fecha || "",
      p.ventas?.numero || "",
      p.ventas?.clientes?.nombre || "",
      p.tipo,
      p.jurisdiccion,
      p.alicuota,
      p.base_imponible,
      p.monto,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `percepciones_${todayARG()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Percepciones</h1>
            <p className="text-sm text-muted-foreground">Seguimiento y reporte de percepciones impositivas</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button
            onClick={() => {
              resetDialog();
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Agregar Percepción
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Percepciones del Mes
            </CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{percepcionesMes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monto IIBB</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(montoIIBB)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monto IVA</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(montoIVA)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Desde</Label>
                <Input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="w-[160px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Hasta</Label>
                <Input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="w-[160px]"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v ?? "all")}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="IIBB">IIBB</SelectItem>
                  <SelectItem value="IVA">IVA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex-1 max-w-xs">
              <Label className="text-xs text-muted-foreground">Jurisdicción</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filtrar jurisdicción..."
                  value={filtroJurisdiccion}
                  onChange={(e) => setFiltroJurisdiccion(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Fecha</th>
                  <th className="text-left p-3 font-medium">Comprobante</th>
                  <th className="text-left p-3 font-medium">Cliente</th>
                  <th className="text-center p-3 font-medium">Tipo</th>
                  <th className="text-left p-3 font-medium">Jurisdicción</th>
                  <th className="text-right p-3 font-medium">Alícuota %</th>
                  <th className="text-right p-3 font-medium">Base Imponible</th>
                  <th className="text-right p-3 font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      No se encontraron percepciones
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="p-3">{p.ventas?.fecha || "-"}</td>
                      <td className="p-3 font-mono">{p.ventas?.numero || "-"}</td>
                      <td className="p-3">{p.ventas?.clientes?.nombre || "-"}</td>
                      <td className="p-3 text-center">
                        <Badge
                          className={
                            p.tipo === "IIBB"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-sky-100 text-sky-800"
                          }
                        >
                          {p.tipo}
                        </Badge>
                      </td>
                      <td className="p-3">{p.jurisdiccion}</td>
                      <td className="p-3 text-right">{p.alicuota}%</td>
                      <td className="p-3 text-right">
                        {formatCurrency(p.base_imponible)}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {formatCurrency(p.monto)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Agregar Percepción Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="overflow-hidden">
          <DialogHeader>
            <DialogTitle>Agregar Percepción</DialogTitle>
          </DialogHeader>
          <div className="w-full overflow-hidden space-y-4">
            <div className="space-y-2">
              <Label>Comprobante (buscar por número)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar venta..."
                  value={ventaSearch}
                  onChange={(e) => searchVentas(e.target.value)}
                  className="pl-9"
                />
                {ventasResult.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {ventasResult.map((v) => (
                      <button
                        key={v.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        onClick={() => selectVenta(v)}
                      >
                        <span className="font-mono">{v.numero}</span>
                        <span className="text-muted-foreground ml-2">
                          {v.fecha} - {(v as unknown as { clientes?: { nombre: string } }).clientes?.nombre || ""} -{" "}
                          {formatCurrency(v.total)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {searchingVentas && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />
                )}
              </div>
              {selectedVenta && (
                <p className="text-xs text-muted-foreground">
                  Venta {selectedVenta.numero} - Total:{" "}
                  {formatCurrency(selectedVenta.total)}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={nuevoTipo}
                  onValueChange={(v) => setNuevoTipo(v as "IIBB" | "IVA")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IIBB">IIBB</SelectItem>
                    <SelectItem value="IVA">IVA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Jurisdicción</Label>
                <Input
                  placeholder="Ej: Buenos Aires, CABA"
                  value={nuevoJurisdiccion}
                  onChange={(e) => setNuevoJurisdiccion(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Alícuota %</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={nuevoAlicuota}
                  onChange={(e) => {
                    setNuevoAlicuota(e.target.value);
                    recalcMonto(nuevoBase, e.target.value);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Base Imponible</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={nuevoBase}
                  onChange={(e) => {
                    setNuevoBase(e.target.value);
                    recalcMonto(e.target.value, nuevoAlicuota);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={nuevoMonto}
                  onChange={(e) => setNuevoMonto(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleGuardar}
                disabled={
                  saving || !selectedVenta || !nuevoJurisdiccion || !nuevoAlicuota
                }
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
