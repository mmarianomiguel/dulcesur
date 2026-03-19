"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { Cliente } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Phone,
  Mail,
  Building2,
  Users,
  Loader2,
  Key,
  KeyRound,
  History,
  FileText,
  X,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { useRouter } from "next/navigation";

const PROVINCIAS = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes",
  "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones",
  "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe",
  "Santiago del Estero", "Tierra del Fuego", "Tucumán",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value);
}

const emptyForm = {
  nombre: "",
  tipo_documento: "",
  numero_documento: "",
  cuit: "",
  situacion_iva: "Consumidor final",
  tipo_factura: "",
  razon_social: "",
  domicilio: "",
  domicilio_fiscal: "",
  telefono: "",
  email: "",
  provincia: "",
  localidad: "",
  codigo_postal: "",
  observacion: "",
  barrio: "",
  vendedor_id: "",
};

export default function ClientesPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Cliente | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [vendedores, setVendedores] = useState<{id:string;nombre:string}[]>([]);
  const [vendedorFilter, setVendedorFilter] = useState("");
  const [vendedorSearch, setVendedorSearch] = useState("");
  const [vendedorOpen, setVendedorOpen] = useState(false);
  const [resetPw, setResetPw] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authId, setAuthId] = useState<string | null>(null);

  // Movements
  const [movClient, setMovClient] = useState<Cliente | null>(null);
  const [movOpen, setMovOpen] = useState(false);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [movLoading, setMovLoading] = useState(false);
  const [movDesde, setMovDesde] = useState("");
  const [movHasta, setMovHasta] = useState("");
  const [movTotals, setMovTotals] = useState({ ventas: 0, nc: 0, cobros: 0, totalGastado: 0 });
  const [movExpanded, setMovExpanded] = useState<string | null>(null);
  // Payment from movimientos
  const [payMovOpen, setPayMovOpen] = useState(false);
  const [payMovVenta, setPayMovVenta] = useState<any>(null);
  const [payMovMonto, setPayMovMonto] = useState(0);
  const [payMovMetodo, setPayMovMetodo] = useState<"Efectivo" | "Transferencia">("Efectivo");
  const [payMovSaving, setPayMovSaving] = useState(false);
  const vendedorRef = useRef<HTMLDivElement>(null);


  const fetchClients = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clientes")
      .select("id, nombre, tipo_documento, numero_documento, cuit, situacion_iva, tipo_factura, razon_social, domicilio, domicilio_fiscal, telefono, email, provincia, localidad, codigo_postal, observacion, barrio, vendedor_id, saldo, origen, activo")
      .eq("activo", true)
      .order("nombre");
    setClients((data || []) as unknown as Cliente[]);
    const { data: vends } = await supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre");
    setVendedores(vends || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (vendedorRef.current && !vendedorRef.current.contains(e.target as Node)) {
        setVendedorOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const resetForm = () => { setForm(emptyForm); setEditingClient(null); setResetPw(""); setResetMsg(""); setAuthEmail(null); setAuthId(null); };

  const openNew = () => { resetForm(); setDialogOpen(true); };

  const openEdit = async (c: Cliente) => {
    setEditingClient(c);
    setForm({
      nombre: c.nombre,
      tipo_documento: c.tipo_documento || "",
      numero_documento: c.numero_documento || "",
      cuit: c.cuit || "",
      situacion_iva: c.situacion_iva,
      tipo_factura: c.tipo_factura || "",
      razon_social: c.razon_social || "",
      domicilio: c.domicilio || "",
      domicilio_fiscal: c.domicilio_fiscal || "",
      telefono: c.telefono || "",
      email: c.email || "",
      provincia: c.provincia || "",
      localidad: c.localidad || "",
      codigo_postal: c.codigo_postal || "",
      observacion: c.observacion || "",
      barrio: (c as any).barrio || "",
      vendedor_id: (c as any).vendedor_id || "",
    });
    setResetPw("");
    setResetMsg("");
    // Fetch auth record
    const { data: authRec } = await supabase.from("clientes_auth").select("id, email").eq("cliente_id", c.id).maybeSingle();
    if (authRec) {
      setAuthEmail(authRec.email);
      setAuthId(authRec.id);
    } else {
      setAuthEmail(null);
      setAuthId(null);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      nombre: form.nombre,
      tipo_documento: form.tipo_documento || null,
      numero_documento: form.numero_documento || null,
      cuit: form.cuit || null,
      situacion_iva: form.situacion_iva,
      tipo_factura: form.tipo_factura || null,
      razon_social: form.razon_social || null,
      domicilio: form.domicilio || null,
      domicilio_fiscal: form.domicilio_fiscal || null,
      telefono: form.telefono || null,
      email: form.email || null,
      provincia: form.provincia || null,
      localidad: form.localidad || null,
      codigo_postal: form.codigo_postal || null,
      observacion: form.observacion || null,
      barrio: form.barrio || null,
      vendedor_id: form.vendedor_id || null,
    };
    if (editingClient) {
      await supabase.from("clientes").update(payload).eq("id", editingClient.id);
    } else {
      await supabase.from("clientes").insert(payload);
    }
    setDialogOpen(false);
    resetForm();
    fetchClients();
  };

  const handleResetPassword = async () => {
    if (!authId || !resetPw) return;
    setResetMsg("");
    const { error } = await supabase.from("clientes_auth").update({ password_hash: resetPw }).eq("id", authId);
    if (error) {
      setResetMsg("Error al restablecer la contraseña: " + error.message);
    } else {
      setResetMsg("Contraseña restablecida correctamente.");
      setResetPw("");
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("clientes").update({ activo: false }).eq("id", id);
    fetchClients();
  };

  const openMovimientos = async (client: Cliente) => {
    setMovClient(client);
    setMovOpen(true);
    const hoy = new Date().toISOString().split("T")[0];
    const hace30 = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    setMovDesde(hace30);
    setMovHasta(hoy);
    await fetchMovimientos(client.id, hace30, hoy);
  };

  const fetchMovimientos = async (clienteId: string, desde: string, hasta: string) => {
    setMovLoading(true);
    // Fetch ventas (includes NC) with items
    const { data: ventas } = await supabase
      .from("ventas")
      .select("id, numero, tipo_comprobante, fecha, created_at, forma_pago, total, venta_items(descripcion, cantidad, presentacion, unidades_por_presentacion, precio_unitario, subtotal, producto_id)")
      .eq("cliente_id", clienteId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("created_at", { ascending: false });

    // Fetch cobros
    const { data: cobros } = await supabase
      .from("cobros")
      .select("id, fecha, created_at, monto, metodo_pago, observacion")
      .eq("cliente_id", clienteId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("created_at", { ascending: false });

    // Fetch cuenta corriente
    const { data: cc } = await supabase
      .from("cuenta_corriente")
      .select("id, fecha, comprobante, descripcion, debe, haber, saldo, forma_pago, venta_id")
      .eq("cliente_id", clienteId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false });

    // Compute pending balance per venta from cuenta_corriente
    const ventaIds = (ventas || []).map((v: any) => v.id);
    const saldoPorVenta: Record<string, number> = {};
    if (ventaIds.length > 0) {
      const { data: ccAll } = await supabase
        .from("cuenta_corriente")
        .select("venta_id, debe, haber")
        .in("venta_id", ventaIds);
      for (const row of ccAll || []) {
        saldoPorVenta[row.venta_id] = (saldoPorVenta[row.venta_id] || 0) + (row.debe || 0) - (row.haber || 0);
      }
    }

    // Also fetch payments per venta from caja_movimientos
    const pagadoPorVenta: Record<string, number> = {};
    if (ventaIds.length > 0) {
      const { data: cajaMovs } = await supabase
        .from("caja_movimientos")
        .select("referencia_id, monto")
        .eq("tipo", "ingreso")
        .eq("referencia_tipo", "venta")
        .in("referencia_id", ventaIds);
      for (const m of cajaMovs || []) {
        pagadoPorVenta[m.referencia_id] = (pagadoPorVenta[m.referencia_id] || 0) + m.monto;
      }
    }

    // Build unified list
    const all: any[] = [];
    for (const v of ventas || []) {
      const isNC = v.tipo_comprobante?.includes("Nota de Crédito");
      const vitems = (v as any).venta_items || [];
      const saldoPendiente = Math.max(0, saldoPorVenta[v.id] || 0);
      const pagado = pagadoPorVenta[v.id] || 0;
      all.push({
        id: v.id,
        fecha: v.fecha,
        created_at: v.created_at || v.fecha,
        tipo: isNC ? "Nota de Crédito" : "Venta",
        descripcion: `${v.tipo_comprobante} ${v.numero}`,
        numero: v.numero,
        items: vitems,
        forma_pago: v.forma_pago,
        monto: isNC ? -v.total : v.total,
        total: v.total,
        saldo_pendiente: saldoPendiente,
        pagado: pagado,
        color: isNC ? "text-emerald-600" : "text-foreground",
        badge: isNC ? "destructive" : "default",
        cliente_id: clienteId,
      });
    }
    for (const c of cobros || []) {
      all.push({
        id: c.id,
        fecha: c.fecha,
        created_at: c.created_at || c.fecha,
        tipo: "Cobro",
        descripcion: c.observacion || "Cobro",
        forma_pago: c.metodo_pago,
        monto: -(c.monto || 0),
        color: "text-blue-600",
        badge: "secondary",
      });
    }

    all.sort((a, b) => (b.created_at || b.fecha).localeCompare(a.created_at || a.fecha));
    setMovimientos(all);

    // Totals
    const totalVentas = (ventas || []).filter((v: any) => !v.tipo_comprobante?.includes("Nota de Crédito")).reduce((s: number, v: any) => s + v.total, 0);
    const totalNC = (ventas || []).filter((v: any) => v.tipo_comprobante?.includes("Nota de Crédito")).reduce((s: number, v: any) => s + v.total, 0);
    const totalCobros = (cobros || []).reduce((s: number, c: any) => s + (c.monto || 0), 0);
    setMovTotals({ ventas: totalVentas, nc: totalNC, cobros: totalCobros, totalGastado: totalVentas - totalNC });
    setMovLoading(false);
  };

  const openPayMov = (m: any) => {
    setPayMovVenta(m);
    setPayMovMonto(m.saldo_pendiente || 0);
    setPayMovMetodo("Efectivo");
    setPayMovOpen(true);
  };

  const handlePayMov = async () => {
    if (!payMovVenta || payMovMonto <= 0 || !movClient?.id) return;
    setPayMovSaving(true);
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const hora = new Date().toTimeString().split(" ")[0];
    const saldoPend = payMovVenta.saldo_pendiente || 0;
    const montoReal = Math.min(payMovMonto, saldoPend);
    const restante = saldoPend - montoReal;

    // Register payment in caja
    await supabase.from("caja_movimientos").insert({
      fecha: hoy, hora, tipo: "ingreso",
      descripcion: `Cobro deuda ${payMovVenta.descripcion} — ${clients.find((c) => c.id === movClient?.id)?.nombre || ""}`,
      metodo_pago: payMovMetodo,
      monto: montoReal,
      referencia_id: payMovVenta.id,
      referencia_tipo: "venta",
    });

    // Update cuenta_corriente
    const cli = clients.find((c) => c.id === movClient?.id);
    const currentSaldo = cli?.saldo || 0;
    const newSaldo = currentSaldo - montoReal;
    await supabase.from("cuenta_corriente").insert({
      cliente_id: movClient?.id,
      fecha: hoy,
      comprobante: `Cobro deuda - ${payMovVenta.descripcion}`,
      descripcion: `Pago de deuda (${payMovMetodo}) — desde Clientes`,
      debe: 0,
      haber: montoReal,
      saldo: Math.max(0, newSaldo),
      forma_pago: payMovMetodo,
      venta_id: payMovVenta.id,
    });
    await supabase.from("clientes").update({ saldo: Math.max(0, newSaldo) }).eq("id", movClient?.id);

    setPayMovSaving(false);
    setPayMovOpen(false);
    // Refresh
    if (movClient?.id) fetchMovimientos(movClient.id, movDesde, movHasta);
    fetchClients();
  };

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return clients.filter(
      (c) =>
        (c.nombre.toLowerCase().includes(searchLower) || (c.cuit || "").includes(search)) &&
        (!vendedorFilter || (c as any).vendedor_id === vendedorFilter)
    );
  }, [clients, search, vendedorFilter]);

  const inscriptos = useMemo(() => clients.filter((c) => c.situacion_iva === "Responsable Inscripto").length, [clients]);
  const withBalance = useMemo(() => clients.filter((c) => c.saldo > 0).length, [clients]);
  const withFavor = useMemo(() => clients.filter((c) => c.saldo < 0).length, [clients]);

  const f = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground text-sm">{clients.length} clientes registrados</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Nuevo cliente</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Users className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total clientes</p><p className="text-xl font-bold">{clients.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><Building2 className="w-5 h-5 text-emerald-500" /></div>
            <div><p className="text-xs text-muted-foreground">Resp. Inscriptos</p><p className="text-xl font-bold">{inscriptos}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center"><Users className="w-5 h-5 text-orange-500" /></div>
            <div><p className="text-xs text-muted-foreground">Con saldo pendiente</p><p className="text-xl font-bold">{withBalance}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><Users className="w-5 h-5 text-emerald-500" /></div>
            <div><p className="text-xs text-muted-foreground">Con saldo a favor</p><p className="text-xl font-bold">{withFavor}</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <span className="text-xs text-muted-foreground font-semibold tracking-wide">BUSCAR</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar por nombre o CUIT..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            {vendedores.length > 0 && (
              <div className="space-y-1.5 min-w-[200px]" ref={vendedorRef}>
                <span className="text-xs text-muted-foreground font-semibold tracking-wide">VENDEDOR</span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar por vendedor..."
                    value={vendedorFilter ? (vendedores.find((v) => v.id === vendedorFilter)?.nombre ?? vendedorSearch) : vendedorSearch}
                    onChange={(e) => { setVendedorSearch(e.target.value); setVendedorFilter(""); setVendedorOpen(true); }}
                    onFocus={() => setVendedorOpen(true)}
                    className="pl-9"
                  />
                  {vendedorFilter && (
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setVendedorFilter(""); setVendedorSearch(""); }}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {vendedorOpen && !vendedorFilter && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                      <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setVendedorFilter(""); setVendedorSearch(""); setVendedorOpen(false); }}>
                        Todos los vendedores
                      </button>
                      {vendedores.filter((v) => v.nombre.toLowerCase().includes(vendedorSearch.toLowerCase())).map((v) => (
                        <button key={v.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                          onClick={() => { setVendedorFilter(v.id); setVendedorSearch(""); setVendedorOpen(false); }}>
                          {v.nombre}
                        </button>
                      ))}
                      {vendedores.filter((v) => v.nombre.toLowerCase().includes(vendedorSearch.toLowerCase())).length === 0 && (
                        <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-4 font-medium">Cliente</th>
                    <th className="text-left py-3 px-4 font-medium">CUIT</th>
                    <th className="text-left py-3 px-4 font-medium">Situación IVA</th>
                    <th className="text-left py-3 px-4 font-medium">Contacto</th>
                    <th className="text-right py-3 px-4 font-medium">Saldo</th>
                    <th className="text-right py-3 px-4 font-medium w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client) => (
                    <tr key={client.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-medium">
                        <div className="flex items-center gap-2">
                          {client.nombre}
                          {(client as unknown as Record<string, unknown>).origen === "tienda" && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-pink-300 text-pink-600 bg-pink-50">Tienda</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{client.cuit || "—"}</td>
                      <td className="py-3 px-4">
                        <Badge variant={client.situacion_iva === "Responsable Inscripto" ? "default" : "secondary"} className="text-xs font-normal">
                          {client.situacion_iva}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3 text-muted-foreground text-xs">
                          {client.telefono && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{client.telefono}</span>}
                          {client.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{client.email}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {client.saldo > 0 ? (
                          <span className="font-semibold text-orange-500">{formatCurrency(client.saldo)}</span>
                        ) : client.saldo < 0 ? (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-xs font-semibold">
                            A favor: {formatCurrency(Math.abs(client.saldo))}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openMovimientos(client)} title="Movimientos"><History className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(client)} title="Editar"><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(client.id)} title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></Button>
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

      {/* Movements Dialog */}
      <Dialog open={movOpen} onOpenChange={setMovOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Movimientos - {movClient?.nombre}
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-end gap-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={movDesde} onChange={(e) => setMovDesde(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={movHasta} onChange={(e) => setMovHasta(e.target.value)} className="h-8 text-sm" />
            </div>
            <Button size="sm" className="h-8" onClick={() => movClient && fetchMovimientos(movClient.id, movDesde, movHasta)}>
              <Search className="w-3.5 h-3.5 mr-1" />Filtrar
            </Button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Ventas</p>
              <p className="text-lg font-bold">{formatCurrency(movTotals.ventas)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Notas de Crédito</p>
              <p className="text-lg font-bold text-red-500">-{formatCurrency(movTotals.nc)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Cobros</p>
              <p className="text-lg font-bold text-blue-600">{formatCurrency(movTotals.cobros)}</p>
            </div>
            <div className="rounded-lg border p-3 bg-primary/5">
              <p className="text-xs text-muted-foreground">Total gastado</p>
              <p className="text-lg font-bold text-primary">{formatCurrency(movTotals.totalGastado)}</p>
            </div>
          </div>

          {/* Movements table */}
          {movLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : movimientos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin movimientos en el período seleccionado</p>
            </div>
          ) : (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium">Fecha</th>
                    <th className="text-left py-2 px-3 font-medium">Tipo</th>
                    <th className="text-left py-2 px-3 font-medium">Descripción</th>
                    <th className="text-left py-2 px-3 font-medium">Forma pago</th>
                    <th className="text-right py-2 px-3 font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m, i) => {
                    const key = `${m.tipo}-${m.id}-${i}`;
                    const isExp = movExpanded === key;
                    const hasItems = m.items && m.items.length > 0;
                    return (
                      <React.Fragment key={key}>
                        <tr
                          className={`border-b last:border-0 hover:bg-muted/50 ${hasItems ? "cursor-pointer" : ""}`}
                          onClick={() => hasItems && setMovExpanded(isExp ? null : key)}
                        >
                          <td className="py-2 px-3 text-muted-foreground">{new Date(m.fecha + "T12:00:00").toLocaleDateString("es-AR")}</td>
                          <td className="py-2 px-3">
                            <Badge variant={m.badge as any} className="text-xs font-normal">{m.tipo}</Badge>
                          </td>
                          <td className="py-2 px-3 text-xs">
                            <div className="flex items-center gap-1">
                              <span>{m.descripcion}</span>
                              {hasItems && (
                                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${isExp ? "rotate-180" : ""}`} />
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <Badge variant="outline" className="text-xs font-normal">{m.forma_pago || "—"}</Badge>
                          </td>
                          <td className={`py-2 px-3 text-right font-semibold ${m.monto < 0 ? "text-emerald-600" : ""}`}>
                            <div>{m.monto < 0 ? `-${formatCurrency(Math.abs(m.monto))}` : formatCurrency(m.monto)}</div>
                            {m.saldo_pendiente > 0 && (
                              <div className="flex items-center justify-end gap-1.5 mt-1">
                                <span className="text-[10px] text-orange-600 font-medium">Debe: {formatCurrency(m.saldo_pendiente)}</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openPayMov(m); }}
                                  className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-2 py-0.5 rounded-full font-medium transition-colors"
                                >
                                  Cobrar
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {isExp && hasItems && (
                          <tr>
                            <td colSpan={5} className="px-3 pb-3 pt-0">
                              <div className="bg-muted/30 rounded-lg p-3 mt-1">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground">
                                      <th className="text-left py-1 font-medium">Producto</th>
                                      <th className="text-center py-1 font-medium">Cant.</th>
                                      <th className="text-right py-1 font-medium">Precio</th>
                                      <th className="text-right py-1 font-medium">Subtotal</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {m.items.map((it: any, idx: number) => {
                                      const isBox = it.presentacion && it.presentacion !== "Unidad" && (it.unidades_por_presentacion || 1) > 1;
                                      const unitPrice = isBox ? it.precio_unitario / (it.unidades_por_presentacion || 1) : it.precio_unitario;
                                      // Clean "(Unidad)" and duplicate presentation from description
                                      let displayName = (it.descripcion || "")
                                        .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
                                        .replace(/\s*\(Unidad\)$/, "")
                                        .replace(/(\([^)]+\))\s*\1/gi, "$1")
                                        .replace(/Caja\s*\(?x?0\.5\)?/gi, "Medio Cartón")
                                        .replace(/(Medio\s*Cart[oó]n)\s*\(?\s*Medio\s*Cart[oó]n\s*\)?/gi, "$1");
                                      return (
                                        <tr key={idx} className="border-t border-muted">
                                          <td className="py-1">
                                            {displayName}
                                          </td>
                                          <td className="py-1 text-center">{(it.unidades_por_presentacion || 1) > 0 && (it.unidades_por_presentacion || 1) < 1 ? it.cantidad * (it.unidades_por_presentacion || 1) : it.cantidad}{isBox ? ` ${it.presentacion}` : ""}</td>
                                          <td className="py-1 text-right">
                                            {formatCurrency(unitPrice)}
                                            {isBox && <span className="text-[10px] text-muted-foreground block">c/u</span>}
                                          </td>
                                          <td className="py-1 text-right font-medium">{formatCurrency(it.subtotal || it.precio_unitario * it.cantidad)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <div className="text-xs text-muted-foreground mt-2 text-right">
                {movimientos.length} movimiento(s)
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment from Movimientos Dialog */}
      <Dialog open={payMovOpen} onOpenChange={setPayMovOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cobrar deuda</DialogTitle>
          </DialogHeader>
          {payMovVenta && (
            <div className="space-y-4">
              <div className="text-sm space-y-1 bg-muted/50 rounded-lg p-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Comprobante</span><span className="font-mono font-medium text-xs">{payMovVenta.descripcion}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold">{formatCurrency(payMovVenta.total)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Pagado</span><span className="text-emerald-600">{formatCurrency(payMovVenta.pagado || 0)}</span></div>
                <div className="flex justify-between border-t pt-1"><span className="font-medium">Deuda</span><span className="text-orange-600 font-bold">{formatCurrency(payMovVenta.saldo_pendiente)}</span></div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Método de pago</Label>
                <div className="flex gap-2">
                  {(["Efectivo", "Transferencia"] as const).map((m) => (
                    <button key={m} onClick={() => setPayMovMetodo(m)} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${payMovMetodo === m ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Monto a cobrar</Label>
                <Input type="number" value={payMovMonto} onChange={(e) => setPayMovMonto(Math.max(0, Math.min(payMovVenta.saldo_pendiente, Number(e.target.value))))} />
              </div>
              {payMovMonto < payMovVenta.saldo_pendiente && payMovMonto > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Restará <strong>{formatCurrency(payMovVenta.saldo_pendiente - payMovMonto)}</strong> de deuda en este comprobante.
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setPayMovOpen(false)}>Cancelar</Button>
                <Button size="sm" onClick={handlePayMov} disabled={payMovSaving || payMovMonto <= 0}>
                  {payMovSaving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Confirmar — {formatCurrency(payMovMonto)}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="persona" className="mt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="persona">Persona física</TabsTrigger>
              <TabsTrigger value="facturacion">Datos de facturación</TabsTrigger>
              <TabsTrigger value="password">Restablecer contraseña</TabsTrigger>
            </TabsList>
            <TabsContent value="persona" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Apellido y Nombre</Label>
                  <Input value={form.nombre} onChange={(e) => f("nombre", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Documento</Label>
                  <Select value={form.tipo_documento} onValueChange={(v) => f("tipo_documento", v || "")}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DNI">DNI</SelectItem>
                      <SelectItem value="CUIT">CUIT</SelectItem>
                      <SelectItem value="CUIL">CUIL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Número de Documento</Label>
                  <Input value={form.numero_documento} onChange={(e) => f("numero_documento", e.target.value)} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Domicilio</Label>
                  <Input value={form.domicilio} onChange={(e) => f("domicilio", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input value={form.telefono} onChange={(e) => f("telefono", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => f("email", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Provincia</Label>
                  <Select value={form.provincia} onValueChange={(v) => f("provincia", v || "")}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {PROVINCIAS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Localidad</Label>
                  <Input value={form.localidad} onChange={(e) => f("localidad", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Barrio / Zona</Label>
                  <Input value={form.barrio} onChange={(e) => f("barrio", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Código Postal</Label>
                  <Input value={form.codigo_postal} onChange={(e) => f("codigo_postal", e.target.value)} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Vendedor</Label>
                  <Select value={form.vendedor_id} onValueChange={(v) => f("vendedor_id", v || "")}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {vendedores.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Observación</Label>
                  <Textarea value={form.observacion} onChange={(e) => f("observacion", e.target.value)} rows={3} />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="facturacion" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Razón social</Label>
                  <Input value={form.razon_social} onChange={(e) => f("razon_social", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>CUIT</Label>
                  <Input value={form.cuit} onChange={(e) => f("cuit", e.target.value)} placeholder="XX-XXXXXXXX-X" />
                </div>
                <div className="space-y-2">
                  <Label>Situación IVA</Label>
                  <Select value={form.situacion_iva} onValueChange={(v) => f("situacion_iva", v || "Consumidor final")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Consumidor final">Consumidor final</SelectItem>
                      <SelectItem value="Responsable Inscripto">Responsable Inscripto</SelectItem>
                      <SelectItem value="Monotributista">Monotributista</SelectItem>
                      <SelectItem value="Exento">Exento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Domicilio Fiscal</Label>
                  <Input value={form.domicilio_fiscal} onChange={(e) => f("domicilio_fiscal", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo Factura</Label>
                  <Select value={form.tipo_factura} onValueChange={(v) => f("tipo_factura", v || "")}>
                    <SelectTrigger><SelectValue placeholder="Sin especificar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">Factura A</SelectItem>
                      <SelectItem value="B">Factura B</SelectItem>
                      <SelectItem value="C">Factura C</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="password" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">Solo disponible para clientes con cuenta en la tienda online</p>
              {editingClient && authEmail ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email de la cuenta</Label>
                    <Input value={authEmail} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Nueva contraseña</Label>
                    <Input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="Ingrese la nueva contraseña" />
                  </div>
                  {resetMsg && (
                    <p className={`text-sm ${resetMsg.startsWith("Error") ? "text-destructive" : "text-emerald-600"}`}>{resetMsg}</p>
                  )}
                  <Button onClick={handleResetPassword} disabled={!resetPw}>
                    <KeyRound className="w-4 h-4 mr-2" />Restablecer contraseña
                  </Button>
                </div>
              ) : editingClient ? (
                <p className="text-sm text-muted-foreground">Este cliente no tiene una cuenta en la tienda online.</p>
              ) : (
                <p className="text-sm text-muted-foreground">Guarde el cliente primero para gestionar su contraseña.</p>
              )}
            </TabsContent>
          </Tabs>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingClient ? "Guardar cambios" : "Crear cliente"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
