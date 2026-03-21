"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { todayARG } from "@/lib/formatters";
import type { Cliente, Venta } from "@/types/database";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus,
  FileText,
  X,
  Loader2,
  FilePlus,
  TrendingUp,
} from "lucide-react";

interface LineItem {
  id: string;
  description: string;
  qty: number;
  unit: string;
  price: number;
  subtotal: number;
}

interface NotaDebitoRow extends Venta {
  clientes?: { nombre: string } | null;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);
}

function getTipoFactura(cliente: Cliente | undefined): string {
  if (!cliente || !cliente.tipo_factura) return "B";
  return cliente.tipo_factura;
}

export default function NotaDebitoPage() {
  const [tab, setTab] = useState("listado");

  // List
  const [notas, setNotas] = useState<NotaDebitoRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Form
  const [clients, setClients] = useState<Cliente[]>([]);
  const [clientId, setClientId] = useState("");
  const [origenId, setOrigenId] = useState("");
  const [clientVentas, setClientVentas] = useState<Venta[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newPrice, setNewPrice] = useState(0);
  const [newQty, setNewQty] = useState(1);
  const [successMsg, setSuccessMsg] = useState("");

  const fetchNotas = useCallback(async () => {
    setLoadingList(true);
    const { data } = await supabase
      .from("ventas")
      .select("*, clientes(nombre)")
      .ilike("tipo_comprobante", "Nota de Débito%")
      .order("fecha", { ascending: false })
      .limit(100);
    setNotas((data as NotaDebitoRow[]) || []);
    setLoadingList(false);
  }, []);

  const fetchClients = useCallback(async () => {
    const { data } = await supabase
      .from("clientes")
      .select("*")
      .eq("activo", true)
      .order("nombre");
    setClients(data || []);
  }, []);

  useEffect(() => {
    fetchNotas();
    fetchClients();
  }, [fetchNotas, fetchClients]);

  useEffect(() => {
    if (!clientId) {
      setClientVentas([]);
      setOrigenId("");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("ventas")
        .select("*")
        .eq("cliente_id", clientId)
        .not("tipo_comprobante", "ilike", "Nota de Débito%")
        .not("tipo_comprobante", "ilike", "Nota de Crédito%")
        .order("fecha", { ascending: false })
        .limit(50);
      setClientVentas(data || []);
    })();
  }, [clientId]);

  const selectedClient = clients.find((c) => c.id === clientId);

  const addConcepto = () => {
    if (!newDesc.trim() || newPrice <= 0) return;
    setItems([
      ...items,
      {
        id: crypto.randomUUID(),
        description: newDesc,
        qty: newQty,
        unit: "UN",
        price: newPrice,
        subtotal: newPrice * newQty,
      },
    ]);
    setNewDesc("");
    setNewPrice(0);
    setNewQty(1);
    setAddOpen(false);
  };

  const removeItem = (id: string) => setItems(items.filter((i) => i.id !== id));

  const updateQty = (id: string, qty: number) => {
    if (qty < 1) return;
    setItems(
      items.map((i) =>
        i.id === id ? { ...i, qty, subtotal: i.price * qty } : i
      )
    );
  };

  const updatePrice = (id: string, price: number) => {
    setItems(
      items.map((i) =>
        i.id === id ? { ...i, price, subtotal: price * i.qty } : i
      )
    );
  };

  const total = items.reduce((acc, i) => acc + i.subtotal, 0);

  const handleSave = async () => {
    if (!clientId || items.length === 0) return;
    setSaving(true);

    const letra = getTipoFactura(selectedClient);
    const tipoComprobante = `Nota de Débito ${letra}`;

    const { data: numData } = await supabase.rpc("next_numero", {
      p_tipo: "nota_debito",
    });
    const numero = numData || "00001-00000000";

    const hoy = todayARG();

    const { data: venta } = await supabase
      .from("ventas")
      .insert({
        numero,
        tipo_comprobante: tipoComprobante,
        fecha: hoy,
        cliente_id: clientId,
        vendedor_id: null,
        forma_pago: "Cuenta Corriente",
        subtotal: total,
        descuento_porcentaje: 0,
        recargo_porcentaje: 0,
        total,
        estado: "cerrada",
        observacion: observacion || null,
        remito_origen_id: origenId || null,
      })
      .select()
      .single();

    if (venta) {
      const ventaItems = items.map((i) => ({
        venta_id: venta.id,
        producto_id: null,
        codigo: null,
        descripcion: i.description,
        cantidad: i.qty,
        unidad_medida: i.unit,
        precio_unitario: i.price,
        descuento: 0,
        subtotal: i.subtotal,
      }));
      await supabase.from("venta_items").insert(ventaItems);

      // Register debe in cuenta_corriente (debit to client)
      const { data: freshCliente } = await supabase.from("clientes").select("saldo").eq("id", clientId).single();
      const saldoActual = freshCliente?.saldo ?? selectedClient?.saldo ?? 0;
      const nuevoSaldo = saldoActual + total;
      await supabase.from("cuenta_corriente").insert({
        cliente_id: clientId,
        fecha: hoy,
        comprobante: `ND ${numero}`,
        descripcion: `Nota de Débito ${numero}`,
        debe: total,
        haber: 0,
        saldo: nuevoSaldo,
        forma_pago: "Cuenta Corriente",
        venta_id: venta.id,
      });

      // Update client saldo
      await supabase
        .from("clientes")
        .update({ saldo: nuevoSaldo })
        .eq("id", clientId);

      setItems([]);
      setObservacion("");
      setOrigenId("");
      setTab("listado");
      fetchNotas();
      fetchClients();
      setSuccessMsg(`Nota de Débito ${numero} creada por ${formatCurrency(total)}`);
    }

    setSaving(false);
  };

  const totalND = notas.reduce((acc, n) => acc + n.total, 0);
  const countMes = notas.filter(
    (n) => n.fecha >= new Date().toISOString().slice(0, 7)
  ).length;

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Notas de Débito</h1>
          <p className="text-muted-foreground text-sm">
            Crear y consultar notas de débito
          </p>
        </div>
        <Badge variant="outline">
          <FilePlus className="w-3.5 h-3.5 mr-1" />
          ND
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total ND emitidas</p>
            <p className="text-2xl font-bold">{notas.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Monto total ND</p>
            <p className="text-2xl font-bold">{formatCurrency(totalND)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">ND este mes</p>
            <p className="text-2xl font-bold">{countMes}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v ?? "list")}>
        <TabsList>
          <TabsTrigger value="listado">Listado</TabsTrigger>
          <TabsTrigger value="nueva">Nueva Nota de Débito</TabsTrigger>
        </TabsList>

        <TabsContent value="listado" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              {loadingList ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : notas.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No hay notas de débito</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 px-3 font-medium">Número</th>
                        <th className="text-left py-2 px-3 font-medium">Fecha</th>
                        <th className="text-left py-2 px-3 font-medium">Tipo</th>
                        <th className="text-left py-2 px-3 font-medium">Cliente</th>
                        <th className="text-right py-2 px-3 font-medium">Total</th>
                        <th className="text-left py-2 px-3 font-medium">Observación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notas.map((n) => (
                        <tr key={n.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-2 px-3 font-mono text-xs">{n.numero}</td>
                          <td className="py-2 px-3">{n.fecha}</td>
                          <td className="py-2 px-3">
                            <Badge variant="secondary">{n.tipo_comprobante}</Badge>
                          </td>
                          <td className="py-2 px-3">{n.clientes?.nombre || "-"}</td>
                          <td className="py-2 px-3 text-right font-semibold">
                            {formatCurrency(n.total)}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground text-xs max-w-[200px] truncate">
                            {n.observacion || "-"}
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

        <TabsContent value="nueva" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {/* Client & Origin */}
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Cliente</Label>
                      <Select value={clientId} onValueChange={(v) => setClientId(v || "")}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Comprobante de referencia (opcional)
                      </Label>
                      <Select value={origenId} onValueChange={(v) => setOrigenId(v || "")}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin referencia" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin referencia</SelectItem>
                          {clientVentas.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.tipo_comprobante} {v.numero} - {formatCurrency(v.total)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {selectedClient && (
                    <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
                      <span>CUIT: {selectedClient.cuit || "-"}</span>
                      <span>IVA: {selectedClient.situacion_iva}</span>
                      <span>Factura: {selectedClient.tipo_factura || "B"}</span>
                      <span>Saldo: {formatCurrency(selectedClient.saldo)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Items */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Conceptos</CardTitle>
                    <Button size="sm" onClick={() => setAddOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Agregar concepto
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {items.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No hay conceptos cargados</p>
                      <p className="text-xs mt-1">
                        Agregue intereses, cargos adicionales u otros conceptos
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-2 px-3 font-medium">Descripción</th>
                            <th className="text-center py-2 px-3 font-medium w-20">Cant</th>
                            <th className="text-right py-2 px-3 font-medium w-28">Precio</th>
                            <th className="text-right py-2 px-3 font-medium w-28">Subtotal</th>
                            <th className="w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <tr key={item.id} className="border-b last:border-0">
                              <td className="py-2 px-3 font-medium">{item.description}</td>
                              <td className="py-2 px-3">
                                <Input
                                  type="number"
                                  value={item.qty}
                                  onChange={(e) =>
                                    updateQty(item.id, Number(e.target.value))
                                  }
                                  className="w-16 text-center h-8 mx-auto"
                                  min={1}
                                />
                              </td>
                              <td className="py-2 px-3">
                                <Input
                                  type="number"
                                  value={item.price}
                                  onChange={(e) =>
                                    updatePrice(item.id, Number(e.target.value))
                                  }
                                  className="w-24 text-right h-8 ml-auto"
                                  min={0}
                                />
                              </td>
                              <td className="py-2 px-3 text-right font-semibold">
                                {formatCurrency(item.subtotal)}
                              </td>
                              <td className="py-2 px-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeItem(item.id)}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Observacion */}
              <Card>
                <CardContent className="pt-6 space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Motivo / Observación
                  </Label>
                  <Textarea
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    placeholder="Motivo de la nota de débito..."
                    rows={3}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Resumen ND</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tipo</span>
                    <Badge variant="secondary">
                      Nota de Débito {getTipoFactura(selectedClient)}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Conceptos</span>
                    <span>{items.length}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t">
                    <span className="font-semibold">Total</span>
                    <span className="text-2xl font-bold text-primary">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Button
                className="w-full"
                size="lg"
                onClick={handleSave}
                disabled={!clientId || items.length === 0 || saving}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FilePlus className="w-4 h-4 mr-2" />
                )}
                Emitir Nota de Débito
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add concepto dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar concepto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Ej: Intereses por mora, Cargo administrativo..."
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  value={newQty}
                  onChange={(e) => setNewQty(Number(e.target.value))}
                  min={1}
                />
              </div>
              <div className="space-y-2">
                <Label>Precio unitario</Label>
                <Input
                  type="number"
                  value={newPrice}
                  onChange={(e) => setNewPrice(Number(e.target.value))}
                  min={0}
                />
              </div>
            </div>
            <Button className="w-full" onClick={addConcepto}>
              Agregar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success dialog */}
      <Dialog open={!!successMsg} onOpenChange={(open) => !open && setSuccessMsg("")}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
            <p className="text-sm">{successMsg}</p>
            <Button className="w-full" onClick={() => setSuccessMsg("")}>Aceptar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
