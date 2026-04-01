"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
import { todayARG, nowTimeARG, formatCurrency } from "@/lib/formatters";
import type { Cliente, Producto, Usuario, Venta } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  Plus,
  Search,
  FileText,
  X,
  Loader2,
  ClipboardEdit,
  ClipboardList,
  Package,
} from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

interface LineItem {
  id: string;
  producto_id: string | null;
  code: string;
  description: string;
  qty: number;
  unit: string;
  price: number;
  discount: number;
  subtotal: number;
  costo_unitario: number;
  presentacion: string;
  unidades_por_presentacion: number;
}

interface ManualRow extends Venta {
  clientes?: { nombre: string } | null;
}

const TIPOS_COMPROBANTE = [
  "Remito X",
  "Factura A",
  "Factura B",
  "Factura C",
  "Nota de Crédito A",
  "Nota de Crédito B",
  "Nota de Crédito C",
  "Nota de Débito A",
  "Nota de Débito B",
  "Nota de Débito C",
];

const FORMAS_PAGO = [
  "Efectivo",
  "Transferencia",
  "Cuenta Corriente",
  "Mixto",
];

export default function CargaManualPage() {
  const currentUser = useCurrentUser();
  // Data
  const [clients, setClients] = useState<Cliente[]>([]);
  const [products, setProducts] = useState<Producto[]>([]);
  const [presMap, setPresMap] = useState<Record<string, { codigo: string }[]>>({});
  const [sellers, setSellers] = useState<Usuario[]>([]);
  const [recientes, setRecientes] = useState<ManualRow[]>([]);
  const [loadingRecientes, setLoadingRecientes] = useState(true);

  // Form
  const [tipoComprobante, setTipoComprobante] = useState("Remito X");
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState(todayARG());
  const [clientId, setClientId] = useState("");
  const [vendedorId, setVendedorId] = useState("");
  const [formaPago, setFormaPago] = useState("Efectivo");
  const [items, setItems] = useState<LineItem[]>([]);
  const [descuento, setDescuento] = useState(0);
  const [recargo, setRecargo] = useState(0);
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);

  // Selection
  const [selectedItemIdx, setSelectedItemIdx] = useState(-1);
  const [searchHighlight, setSearchHighlight] = useState(0);

  // Dialogs
  const [searchOpen, setSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [freeText, setFreeText] = useState(false);
  const [freeDesc, setFreeDesc] = useState("");
  const [freePrice, setFreePrice] = useState(0);
  const [freeQty, setFreeQty] = useState(1);
  const [successMsg, setSuccessMsg] = useState("");

  const fetchData = useCallback(async () => {
    const [{ data: cls }, { data: prods }, { data: sls }] = await Promise.all([
      supabase.from("clientes").select("*").eq("activo", true).order("nombre"),
      supabase.from("productos").select("*").eq("activo", true).order("nombre").limit(10000),
      supabase.from("usuarios").select("*").eq("activo", true),
    ]);
    setClients(cls || []);
    setProducts(prods || []);
    setSellers(sls || []);
    const { data: allPres } = await supabase.from("presentaciones").select("producto_id, sku");
    if (allPres) {
      const map: Record<string, { codigo: string }[]> = {};
      for (const pr of allPres) { if (!map[pr.producto_id]) map[pr.producto_id] = []; map[pr.producto_id].push({ codigo: pr.sku || "" }); }
      setPresMap(map);
    }
  }, []);

  const fetchRecientes = useCallback(async () => {
    setLoadingRecientes(true);
    const { data } = await supabase
      .from("ventas")
      .select("*, clientes(nombre)")
      .eq("observacion", "Carga manual")
      .order("created_at", { ascending: false })
      .limit(20);
    // Fallback: if no "Carga manual" entries, show most recent
    if (!data || data.length === 0) {
      const { data: fallback } = await supabase
        .from("ventas")
        .select("*, clientes(nombre)")
        .order("created_at", { ascending: false })
        .limit(20);
      setRecientes((fallback as ManualRow[]) || []);
    } else {
      setRecientes((data as ManualRow[]) || []);
    }
    setLoadingRecientes(false);
  }, []);

  useEffect(() => {
    fetchData();
    fetchRecientes();
  }, [fetchData, fetchRecientes]);

  const selectedClient = clients.find((c) => c.id === clientId);

  const filteredProducts = products.filter(
    (p) =>
      norm(p.nombre).includes(norm(productSearch)) ||
      norm(p.codigo).includes(norm(productSearch)) ||
      (presMap[p.id] || []).some((pr) => norm(pr.codigo || "").includes(norm(productSearch)))
  );

  const addItem = (product: Producto) => {
    const existing = items.find((i) => i.producto_id === product.id);
    if (existing) {
      const newItems = items.map((i) =>
        i.id === existing.id
          ? {
              ...i,
              qty: i.qty + 1,
              subtotal: i.price * (i.qty + 1) * (1 - i.discount / 100),
            }
          : i
      );
      setItems(newItems);
      setSelectedItemIdx(newItems.findIndex((i) => i.id === existing.id));
    } else {
      const newItems = [
        ...items,
        {
          id: crypto.randomUUID(),
          producto_id: product.id,
          code: product.codigo,
          description: product.nombre,
          qty: 1,
          unit: product.unidad_medida,
          price: product.precio,
          discount: 0,
          subtotal: product.precio,
          costo_unitario: product.costo || 0,
          presentacion: product.unidad_medida || "Unidad",
          unidades_por_presentacion: 1,
        },
      ];
      setItems(newItems);
      setSelectedItemIdx(newItems.length - 1);
    }
    setSearchOpen(false);
    setProductSearch("");
    setSearchHighlight(0);
  };

  const addFreeItem = () => {
    if (!freeDesc.trim() || freePrice <= 0) return;
    const newItems = [
      ...items,
      {
        id: crypto.randomUUID(),
        producto_id: null,
        code: "-",
        description: freeDesc,
        qty: freeQty,
        unit: "UN",
        price: freePrice,
        discount: 0,
        subtotal: freePrice * freeQty,
        costo_unitario: 0,
        presentacion: "Unidad",
        unidades_por_presentacion: 1,
      },
    ];
    setItems(newItems);
    setSelectedItemIdx(newItems.length - 1);
    setFreeDesc("");
    setFreePrice(0);
    setFreeQty(1);
    setFreeText(false);
  };

  const removeItem = (id: string) => {
    const newItems = items.filter((i) => i.id !== id);
    setItems(newItems);
    if (selectedItemIdx >= newItems.length) setSelectedItemIdx(Math.max(0, newItems.length - 1));
    if (newItems.length === 0) setSelectedItemIdx(-1);
  };

  const updateQty = (id: string, qty: number) => {
    if (qty < 1) return;
    setItems(
      items.map((i) =>
        i.id === id
          ? { ...i, qty, subtotal: i.price * qty * (1 - i.discount / 100) }
          : i
      )
    );
  };

  const updatePrice = (id: string, price: number) => {
    setItems(
      items.map((i) =>
        i.id === id
          ? { ...i, price, subtotal: price * i.qty * (1 - i.discount / 100) }
          : i
      )
    );
  };

  const updateDiscount = (id: string, disc: number) => {
    setItems(
      items.map((i) =>
        i.id === id
          ? { ...i, discount: disc, subtotal: i.price * i.qty * (1 - disc / 100) }
          : i
      )
    );
  };

  const subtotal = items.reduce((acc, i) => acc + i.subtotal, 0);
  const descuentoAmount = subtotal * (descuento / 100);
  const recargoAmount = (subtotal - descuentoAmount) * (recargo / 100);
  const total = subtotal - descuentoAmount + recargoAmount;

  const handleSave = async () => {
    if (items.length === 0) return;
    if (fecha > todayARG()) { showAdminToast("No se puede usar una fecha futura", "error"); return; }
    if (descuento < 0 || descuento > 100 || recargo < 0 || recargo > 100) { showAdminToast("Descuento y recargo deben estar entre 0 y 100", "error"); return; }
    setSaving(true);

    const finalNumero = numero.trim() || undefined;
    let num = finalNumero;
    if (!num) {
      // Auto-generate based on tipo
      let pTipo = "venta";
      if (tipoComprobante.startsWith("Nota de Crédito")) pTipo = "nota_credito";
      else if (tipoComprobante.startsWith("Nota de Débito")) pTipo = "nota_debito";
      const { data: numData } = await supabase.rpc("next_numero", {
        p_tipo: pTipo,
      });
      num = numData || "00001-00000000";
    }

    const { data: venta } = await supabase
      .from("ventas")
      .insert({
        numero: num,
        tipo_comprobante: tipoComprobante,
        fecha,
        cliente_id: clientId || null,
        vendedor_id: vendedorId || null,
        forma_pago: formaPago,
        subtotal,
        descuento_porcentaje: descuento,
        recargo_porcentaje: recargo,
        total,
        estado: "cerrada",
        observacion: observacion || "Carga manual",
      })
      .select()
      .single();

    if (venta) {
      // Insert items
      const ventaItems = items.map((i) => ({
        venta_id: venta.id,
        producto_id: i.producto_id,
        codigo: i.code,
        descripcion: i.description,
        cantidad: i.qty,
        unidad_medida: i.unit,
        precio_unitario: i.price,
        descuento: i.discount,
        subtotal: i.subtotal,
        costo_unitario: i.costo_unitario || 0,
        presentacion: i.presentacion || "Unidad",
        unidades_por_presentacion: i.unidades_por_presentacion || 1,
      }));
      await supabase.from("venta_items").insert(ventaItems);

      // Register caja movement
      const isIngreso =
        !tipoComprobante.startsWith("Nota de Crédito");
      await supabase.from("caja_movimientos").insert({
        fecha,
        hora: nowTimeARG(),
        tipo: isIngreso ? "ingreso" : "cancelacion",
        descripcion: `${tipoComprobante} #${num} (Manual)`,
        metodo_pago: formaPago,
        monto: total,
        referencia_id: venta.id,
        referencia_tipo: "venta",
      });

      // If Cuenta Corriente, update client saldo
      if (formaPago === "Cuenta Corriente" && clientId) {
        const isNC = tipoComprobante.startsWith("Nota de Crédito");
        const isND = tipoComprobante.startsWith("Nota de Débito");

        let debe = 0;
        let haber = 0;
        let saldoChange = 0;

        if (isNC) {
          haber = total;
          saldoChange = -total;
        } else {
          debe = total;
          saldoChange = total;
        }

        // Atomic saldo update via RPC
        const { data: newSaldo } = await supabase.rpc("atomic_update_client_saldo", {
          p_client_id: clientId,
          p_change: saldoChange,
        });

        await supabase.from("cuenta_corriente").insert({
          cliente_id: clientId,
          fecha,
          comprobante: `${tipoComprobante} ${num}`,
          descripcion: `${tipoComprobante} ${num} (Carga manual)`,
          debe,
          haber,
          saldo: newSaldo,
          forma_pago: formaPago,
          venta_id: venta.id,
        });
      }

      // Update stock for product items (deduct for sales/remitos, add for NC)
      const isNC = tipoComprobante.startsWith("Nota de Crédito");
      for (const item of items) {
        if (item.producto_id) {
          // Read fresh stock from DB to avoid stale data
          const { data: freshProd } = await supabase.from("productos").select("stock").eq("id", item.producto_id).single();
          if (freshProd) {
            // Get unidades_por_presentacion for the item's unit
            let unitsMultiplier = 1;
            if (item.unit && item.unit !== "Unidad") {
              const { data: pres } = await supabase.from("presentaciones").select("cantidad").eq("producto_id", item.producto_id).eq("nombre", item.unit).limit(1).single();
              if (pres?.cantidad) {
                unitsMultiplier = pres.cantidad;
              } else {
                // Fallback: presentation not found in DB, use multiplier=1 and warn
                // This can happen if the presentation was deleted or renamed after the item was added
                showAdminToast(`Presentación "${item.unit}" no encontrada para ${item.description}, usando multiplicador 1`, "info");
              }
            }
            const totalUnits = item.qty * unitsMultiplier;
            const newStock = isNC
              ? freshProd.stock + totalUnits
              : freshProd.stock - totalUnits;
            await supabase
              .from("productos")
              .update({ stock: newStock })
              .eq("id", item.producto_id);
            await supabase.from("stock_movimientos").insert({
              producto_id: item.producto_id,
              tipo: isNC ? "devolucion" : "venta",
              cantidad_antes: freshProd.stock,
              cantidad_despues: newStock,
              cantidad: totalUnits,
              referencia: `${tipoComprobante} ${num}`,
              descripcion: `${isNC ? "Devolucion" : "Venta"} - ${item.description}`,
              usuario: currentUser?.nombre || "Admin Sistema",
              orden_id: venta.id,
            });
          }
        }
      }

      // Reset
      setItems([]);
      setSelectedItemIdx(-1);
      setNumero("");
      setObservacion("");
      setDescuento(0);
      setRecargo(0);
      fetchData();
      fetchRecientes();
      setSuccessMsg(
        `${tipoComprobante} ${num} guardado por ${formatCurrency(total)}`
      );
    }

    setSaving(false);
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <ClipboardList className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Carga Manual</h1>
            <p className="text-sm text-muted-foreground">Registrar comprobantes de forma manual</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          {/* Header */}
          <Card>
            <CardContent className="pt-6 overflow-visible">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 overflow-visible">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Tipo de comprobante
                  </Label>
                  <Select
                    value={tipoComprobante}
                    onValueChange={(v) => setTipoComprobante(v || "Remito X")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Tipo de comprobante" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_COMPROBANTE.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Número (vacío = auto)
                  </Label>
                  <Input
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder="00001-00000000"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Fecha</Label>
                  <Input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    max={todayARG()}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 overflow-visible">
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
                  <Label className="text-xs text-muted-foreground">Vendedor</Label>
                  <Select
                    value={vendedorId}
                    onValueChange={(v) => setVendedorId(v || "")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar vendedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {sellers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Forma de pago
                  </Label>
                  <Select
                    value={formaPago}
                    onValueChange={(v) => setFormaPago(v || "Efectivo")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Forma de pago" />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMAS_PAGO.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
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
                  <span>Saldo: {formatCurrency(selectedClient.saldo)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Items</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFreeText(true)}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Texto libre
                  </Button>
                  <Button size="sm" onClick={() => setSearchOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar producto
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No hay items cargados</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 px-3 font-medium w-24">Código</th>
                        <th className="text-left py-2 px-3 font-medium">Descripción</th>
                        <th className="text-center py-2 px-3 font-medium w-16">Cant</th>
                        <th className="text-right py-2 px-3 font-medium w-24">Precio</th>
                        <th className="text-center py-2 px-3 font-medium w-16">Dto%</th>
                        <th className="text-right py-2 px-3 font-medium w-28">Subtotal</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={item.id} className={`border-b last:border-0 ${idx === selectedItemIdx ? "bg-primary/5 ring-1 ring-primary/20" : ""}`} onClick={() => setSelectedItemIdx(idx)}>
                          <td className="py-2 px-3 font-mono text-xs text-muted-foreground">
                            {item.code}
                          </td>
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
                          <td className="py-2 px-3">
                            <Input
                              type="number"
                              value={item.discount}
                              onChange={(e) =>
                                updateDiscount(item.id, Number(e.target.value))
                              }
                              className="w-16 text-center h-8 mx-auto"
                              min={0}
                              max={100}
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
              <Label className="text-xs text-muted-foreground">Observación</Label>
              <Textarea
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Observaciones del comprobante..."
                rows={3}
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Descuento</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={descuento}
                    onChange={(e) => setDescuento(Math.max(0, Math.min(100, Number(e.target.value))))}
                    className="w-16 h-7 text-right text-xs"
                    min={0}
                    max={100}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              {descuento > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span></span>
                  <span>-{formatCurrency(descuentoAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Recargo</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={recargo}
                    onChange={(e) => setRecargo(Math.max(0, Math.min(100, Number(e.target.value))))}
                    className="w-16 h-7 text-right text-xs"
                    min={0}
                    max={100}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              {recargo > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span></span>
                  <span>+{formatCurrency(recargoAmount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-semibold">Total</span>
                <span className="text-2xl font-bold text-primary">
                  {formatCurrency(total)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                {items.length} item{items.length !== 1 ? "s" : ""}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Comprobante</span>
                <Badge variant="secondary">{tipoComprobante}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Forma de pago</span>
                <Badge variant="outline">{formaPago}</Badge>
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full"
            size="lg"
            onClick={handleSave}
            disabled={items.length === 0 || saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ClipboardEdit className="w-4 h-4 mr-2" />
            )}
            Guardar comprobante
          </Button>
        </div>
      </div>

      {/* Recent manual entries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comprobantes recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingRecientes ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : recientes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay comprobantes recientes</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium">Número</th>
                    <th className="text-left py-2 px-3 font-medium">Tipo</th>
                    <th className="text-left py-2 px-3 font-medium">Fecha</th>
                    <th className="text-left py-2 px-3 font-medium">Cliente</th>
                    <th className="text-left py-2 px-3 font-medium">Forma pago</th>
                    <th className="text-right py-2 px-3 font-medium">Total</th>
                    <th className="text-left py-2 px-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {recientes.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b last:border-0 hover:bg-muted/50"
                    >
                      <td className="py-2 px-3 font-mono text-xs">{r.numero}</td>
                      <td className="py-2 px-3">
                        <Badge variant="secondary" className="text-xs">
                          {r.tipo_comprobante}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">{r.fecha}</td>
                      <td className="py-2 px-3">{r.clientes?.nombre || "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {r.forma_pago}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold">
                        {formatCurrency(r.total)}
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          variant={r.estado === "cerrada" ? "default" : "outline"}
                          className="text-xs"
                        >
                          {r.estado}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product search dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Buscar producto</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código o descripción..."
              value={productSearch}
              onChange={(e) => { setProductSearch(e.target.value); setSearchHighlight(0); }}
              onKeyDown={(e) => {
                const list = filteredProducts.slice(0, 20);
                if (e.key === "ArrowDown") { e.preventDefault(); setSearchHighlight((h) => Math.min(h + 1, list.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setSearchHighlight((h) => Math.max(h - 1, 0)); }
                else if (e.key === "Enter" && list.length > 0) {
                  e.preventDefault();
                  const p = list[searchHighlight];
                  if (p) addItem(p);
                }
              }}
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {filteredProducts.slice(0, 20).map((p, idx) => {
              const highlighted = idx === searchHighlight;
              return (
              <button
                key={p.id}
                ref={highlighted ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                onClick={() => addItem(p)}
                onMouseEnter={() => setSearchHighlight(idx)}
                className={`w-full rounded-xl border p-3 transition-colors text-left flex items-center gap-3 ${highlighted ? "ring-2 ring-primary border-primary bg-muted/50" : "hover:border-primary/30 hover:bg-primary/5"}`}
              >
                <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                  {(p as any).imagen_url ? (
                    <img src={(p as any).imagen_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-5 h-5 text-muted-foreground/30" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{p.nombre}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">{p.codigo}</span>
                    <span>·</span>
                    <span>Stock: <strong className={p.stock <= 0 ? "text-red-500" : ""}>{p.stock}</strong></span>
                    <span>·</span>
                    <span className="font-semibold text-foreground">{formatCurrency(p.precio)}</span>
                  </div>
                </div>
              </button>
              );
            })}
            {filteredProducts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No se encontraron productos
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Free text dialog */}
      <Dialog open={freeText} onOpenChange={setFreeText}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar item libre</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input
                value={freeDesc}
                onChange={(e) => setFreeDesc(e.target.value)}
                placeholder="Descripción del item"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  value={freeQty}
                  onChange={(e) => setFreeQty(Number(e.target.value))}
                  min={1}
                />
              </div>
              <div className="space-y-2">
                <Label>Precio unitario</Label>
                <Input
                  type="number"
                  value={freePrice}
                  onChange={(e) => setFreePrice(Number(e.target.value))}
                  min={0}
                />
              </div>
            </div>
            <p className="text-xs text-amber-600">Los items de texto libre no descuentan stock</p>
            <Button className="w-full" onClick={addFreeItem}>
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
