"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Send, Loader2, Users, User, MapPin, Shield, Clock,
  CheckCircle, Smartphone, Tag, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { showAdminToast } from "@/components/admin-toast";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/formatters";
import type { NotificacionPlantilla } from "@/types/database";

const SEG_TYPES = [
  { value: "todos", label: "Todos", fullLabel: "Todos los clientes", icon: Users },
  { value: "cliente", label: "Cliente", fullLabel: "Cliente específico", icon: User },
  { value: "zona", label: "Zona", fullLabel: "Por zona de entrega", icon: MapPin },
  { value: "rol", label: "Rol", fullLabel: "Por rol", icon: Shield },
  { value: "inactividad", label: "Inactivos", fullLabel: "Por inactividad", icon: Clock },
];

function getHorarioTexto(horario: string | null): string {
  if (!horario) return "";
  const h = horario.substring(0, 5).replace(":00", "");
  return ` hasta las ${h}hs`;
}

export default function EnviarNotificacionPage() {
  const [plantillas, setPlantillas] = useState<NotificacionPlantilla[]>([]);
  const [plantillaId, setPlantillaId] = useState<string>("");
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [url, setUrl] = useState("");
  const [tipo, setTipo] = useState("promocion");
  const [segTipo, setSegTipo] = useState("todos");
  const [segValor, setSegValor] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Cliente search
  const [clienteQuery, setClienteQuery] = useState("");
  const [clienteResults, setClienteResults] = useState<any[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<any>(null);

  // Zona
  const [zonas, setZonas] = useState<any[]>([]);

  // Estimado
  const [estimado, setEstimado] = useState<number | null>(null);

  // Descuentos
  const [descuentos, setDescuentos] = useState<any[]>([]);
  const [selectedDescuento, setSelectedDescuento] = useState<any>(null);
  const [showDescuentos, setShowDescuentos] = useState(false);

  // Tienda config para horario
  const [horarioCierre, setHorarioCierre] = useState<string | null>(null);

  const fetchPlantillas = useCallback(async () => {
    try {
      const res = await fetch("/api/notificaciones/plantillas");
      const data = await res.json();
      setPlantillas(data.filter((p: NotificacionPlantilla) => p.activa));
    } catch {}
  }, []);

  useEffect(() => {
    fetchPlantillas();

    // Cargar zonas, descuentos y horario en paralelo
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    Promise.all([
      supabase.from("zona_entrega").select("id, nombre"),
      supabase.from("descuentos").select("*").eq("activo", true).lte("fecha_inicio", hoy).or(`fecha_fin.is.null,fecha_fin.gte.${hoy}`).order("nombre"),
      supabase.from("tienda_config").select("horario_atencion_fin").limit(1).single(),
    ]).then(([zonaRes, descRes, cfgRes]) => {
      if (zonaRes.data) setZonas(zonaRes.data);
      if (descRes.data) setDescuentos(descRes.data);
      if (cfgRes.data?.horario_atencion_fin) setHorarioCierre(cfgRes.data.horario_atencion_fin);
    });
  }, [fetchPlantillas]);

  // Buscar clientes
  useEffect(() => {
    if (clienteQuery.length < 2) { setClienteResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("clientes")
        .select("id, nombre, email, saldo")
        .eq("activo", true)
        .ilike("nombre", `%${clienteQuery}%`)
        .limit(8);
      setClienteResults(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [clienteQuery]);

  // Estimar destinatarios
  useEffect(() => {
    const estimate = async () => {
      if (segTipo === "todos") {
        const { count } = await supabase.from("clientes").select("*", { count: "exact", head: true }).eq("activo", true);
        setEstimado(count ?? 0);
      } else if (segTipo === "cliente" && selectedCliente) {
        setEstimado(1);
      } else if (segTipo === "zona" && segValor) {
        const { count } = await supabase.from("clientes").select("*", { count: "exact", head: true }).eq("activo", true).eq("zona_entrega_id", segValor);
        setEstimado(count ?? 0);
      } else if (segTipo === "rol" && segValor) {
        const { count } = await supabase.from("usuarios").select("*", { count: "exact", head: true }).eq("activo", true).eq("rol", segValor);
        setEstimado(count ?? 0);
      } else {
        setEstimado(null);
      }
    };
    estimate();
  }, [segTipo, segValor, selectedCliente]);

  // Reemplazar variables en plantilla con datos reales del cliente
  const reemplazarVariables = (texto: string, cliente: any): string => {
    const nombre = cliente?.nombre || "";
    const primerNombre = nombre.trim().split(" ")[0] || nombre;
    const horarioTexto = getHorarioTexto(horarioCierre);

    return texto
      .replace(/\{\{nombre\}\}/g, primerNombre)
      .replace(/\{\{horario_texto\}\}/g, horarioTexto)
      .replace(/\{\{cliente\}\}/g, primerNombre)
      .replace(/\{\{total\}\}/g, cliente?.saldo ? formatCurrency(cliente.saldo) : "")
      .replace(/\{\{monto_efectivo\}\}/g, "")
      .replace(/\{\{titulo\}\}/g, titulo)
      .replace(/\{\{mensaje\}\}/g, mensaje);
  };

  const handlePlantillaChange = (id: string | null) => {
    if (!id) return;
    setPlantillaId(id);
    setSelectedDescuento(null);
    if (id === "libre") {
      setTitulo("");
      setMensaje("");
      return;
    }
    const p = plantillas.find((x) => x.id === id);
    if (p) {
      // Si hay cliente seleccionado, reemplazar variables inmediatamente
      if (selectedCliente) {
        setTitulo(reemplazarVariables(p.titulo_template, selectedCliente));
        setMensaje(reemplazarVariables(p.mensaje_template, selectedCliente));
      } else {
        setTitulo(p.titulo_template);
        setMensaje(p.mensaje_template);
      }
      setTipo(p.tipo);
    }
  };

  // Cuando se selecciona un cliente, reemplazar variables si hay plantilla
  const handleClienteSelect = (cliente: any) => {
    setSelectedCliente(cliente);
    setClienteResults([]);
    if (plantillaId && plantillaId !== "libre") {
      const p = plantillas.find((x) => x.id === plantillaId);
      if (p) {
        setTitulo(reemplazarVariables(p.titulo_template, cliente));
        setMensaje(reemplazarVariables(p.mensaje_template, cliente));
      }
    }
  };

  // Seleccionar descuento y armar mensaje automático
  const handleDescuentoSelect = (desc: any) => {
    setSelectedDescuento(desc);
    setShowDescuentos(false);

    const nombreDesc = desc.nombre || "descuento especial";
    const pct = desc.porcentaje ? `${desc.porcentaje}%` : "";
    const vence = desc.fecha_fin
      ? ` Válido hasta el ${new Date(desc.fecha_fin + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })}.`
      : "";

    // Si hay cliente seleccionado, personalizar
    const primerNombre = selectedCliente
      ? selectedCliente.nombre.trim().split(" ")[0]
      : "{{nombre}}";

    // Si es descuento exclusivo para clientes específicos
    const esExclusivo = desc.clientes_ids && desc.clientes_ids.length > 0;

    const nuevoTitulo = esExclusivo
      ? `${primerNombre}, tenés un descuento exclusivo 🎁`
      : `${pct} de descuento en ${nombreDesc}`;

    const nuevoMensaje = esExclusivo
      ? `Hola ${primerNombre}, tenés un ${pct} de descuento exclusivo en ${nombreDesc}.${vence} ¡Aprovechalo!`
      : `Hola ${primerNombre}, tenés ${pct} de descuento en ${nombreDesc}.${vence} ¡No te lo pierdas!`;

    setTitulo(nuevoTitulo);
    setMensaje(nuevoMensaje);
    setTipo("promocion");

    // Si el descuento es exclusivo para clientes específicos, preseleccionar segmentación
    if (esExclusivo && desc.clientes_ids.length > 0) {
      showAdminToast(`Descuento exclusivo — se enviará a ${desc.clientes_ids.length} cliente${desc.clientes_ids.length !== 1 ? "s" : ""}`, "info");
    }
  };

  const handleSend = async () => {
    setConfirmOpen(false);
    setSending(true);
    setResult(null);
    try {
      const segmentacion: any = { tipo: segTipo };
      if (segTipo === "cliente" && selectedCliente) segmentacion.valor = selectedCliente.id;
      else if (segTipo === "zona") segmentacion.valor = segValor;
      else if (segTipo === "rol") segmentacion.valor = segValor;
      else if (segTipo === "inactividad") segmentacion.valor = Number(segValor) || 30;

      // Si el descuento tiene clientes específicos, usar esa segmentación
      if (selectedDescuento?.clientes_ids?.length > 0 && segTipo === "todos") {
        segmentacion.tipo = "clientes_ids";
        segmentacion.valor = selectedDescuento.clientes_ids;
      }

      const res = await fetch("/api/notificaciones/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo,
          mensaje,
          tipo,
          url: url || null,
          plantilla_id: plantillaId && plantillaId !== "libre" ? plantillaId : null,
          segmentacion,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      showAdminToast("Notificación enviada", "success");
    } catch (err: any) {
      showAdminToast(err.message || "Error al enviar", "error");
    } finally {
      setSending(false);
    }
  };

  const canSend = titulo.trim() && mensaje.trim()
    && (segTipo !== "cliente" || selectedCliente)
    && (segTipo !== "zona" || segValor)
    && (segTipo !== "rol" || segValor)
    && (segTipo !== "inactividad" || segValor);

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Send className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">Enviar notificación</h1>
          <p className="text-xs text-muted-foreground hidden sm:block">Mandá un mensaje push a tus clientes</p>
        </div>
      </div>

      {/* Card 1 — Contenido */}
      <div className="bg-white dark:bg-gray-900 border rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-xs flex items-center justify-center shrink-0 font-semibold">1</span>
          Contenido
        </div>

        {/* Plantilla o descuento */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Plantilla (opcional)</label>
            <Select value={plantillaId || "libre"} onValueChange={handlePlantillaChange}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="libre">Notificación libre</SelectItem>
                {plantillas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Descuento vigente (opcional)</label>
            <button
              onClick={() => setShowDescuentos(!showDescuentos)}
              className="w-full flex items-center justify-between px-3 py-2 border rounded-md text-sm text-left hover:bg-muted/50 transition-colors"
            >
              <span className={selectedDescuento ? "text-foreground" : "text-muted-foreground"}>
                {selectedDescuento ? selectedDescuento.nombre : "Seleccionar descuento..."}
              </span>
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {showDescuentos && (
              <div className="absolute z-10 mt-1 bg-white dark:bg-gray-900 border rounded-xl shadow-lg max-h-60 overflow-y-auto w-72">
                {descuentos.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">No hay descuentos vigentes</div>
                ) : (
                  descuentos.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => handleDescuentoSelect(d)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/50 text-sm border-b last:border-0"
                    >
                      <div className="font-medium">{d.nombre}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span className="text-green-600 font-semibold">{d.porcentaje}% off</span>
                        {d.fecha_fin && <span>Hasta {new Date(d.fecha_fin + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}</span>}
                        {d.clientes_ids?.length > 0 && <Badge className="text-[10px] px-1 py-0 bg-purple-100 text-purple-700">Exclusivo</Badge>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {selectedDescuento && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-100 rounded-lg">
            <Tag className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs text-green-700 font-medium flex-1">{selectedDescuento.nombre} — {selectedDescuento.porcentaje}% off</span>
            <button onClick={() => setSelectedDescuento(null)} className="text-green-500 hover:text-green-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">Título</label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: María, tu pedido está listo 🎉" />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">Mensaje</label>
          <Textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Ej: Hola María, ya podés pasar a retirar tu pedido..." rows={3} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Tipo</label>
            <Select value={tipo} onValueChange={(v) => v && setTipo(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pedido">Pedido</SelectItem>
                <SelectItem value="promocion">Promoción</SelectItem>
                <SelectItem value="recordatorio">Recordatorio</SelectItem>
                <SelectItem value="catalogo">Catálogo</SelectItem>
                <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                <SelectItem value="sistema">Sistema</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">URL destino (opcional)</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/cuenta/pedidos" />
          </div>
        </div>

        {/* Vista previa */}
        {(titulo || mensaje) && (
          <div className="bg-muted/50 rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Vista previa</span>
            </div>
            <div className="text-sm font-semibold text-foreground">{titulo || "Título..."}</div>
            <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{mensaje || "Mensaje..."}</div>
          </div>
        )}
      </div>

      {/* Card 2 — Destinatarios */}
      <div className="bg-white dark:bg-gray-900 border rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-xs flex items-center justify-center shrink-0 font-semibold">2</span>
          ¿A quién le llega?
        </div>

        <div className="flex flex-wrap gap-2">
          {SEG_TYPES.map((s) => {
            const Icon = s.icon;
            const active = segTipo === s.value;
            return (
              <button
                key={s.value}
                onClick={() => { setSegTipo(s.value); setSegValor(""); setSelectedCliente(null); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full border text-sm transition-all ${
                  active
                    ? "border-blue-200 bg-blue-50 text-blue-700 font-medium"
                    : "border-border hover:border-border/80 text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="sm:hidden">{s.label}</span>
                <span className="hidden sm:inline">{s.fullLabel}</span>
              </button>
            );
          })}
        </div>

        {segTipo === "cliente" && (
          <div className="relative">
            <Input
              value={selectedCliente ? selectedCliente.nombre : clienteQuery}
              onChange={(e) => { setClienteQuery(e.target.value); setSelectedCliente(null); }}
              placeholder="Buscar cliente por nombre..."
            />
            {clienteResults.length > 0 && !selectedCliente && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white dark:bg-gray-900 border rounded-xl mt-1 shadow-lg max-h-48 overflow-y-auto">
                {clienteResults.map((c) => (
                  <button key={c.id} onClick={() => handleClienteSelect(c)}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 text-sm border-b last:border-0">
                    <div className="font-medium">{c.nombre}</div>
                    {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {segTipo === "zona" && (
          <Select value={segValor} onValueChange={(v) => v && setSegValor(v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar zona..." /></SelectTrigger>
            <SelectContent>{zonas.map((z) => <SelectItem key={z.id} value={z.id}>{z.nombre}</SelectItem>)}</SelectContent>
          </Select>
        )}

        {segTipo === "rol" && (
          <Select value={segValor} onValueChange={(v) => v && setSegValor(v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar rol..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="vendedor">Vendedor</SelectItem>
              <SelectItem value="repartidor">Repartidor</SelectItem>
            </SelectContent>
          </Select>
        )}

        {segTipo === "inactividad" && (
          <div className="flex items-center gap-2">
            <Input type="number" value={segValor} onChange={(e) => setSegValor(e.target.value)} placeholder="30" className="w-20" />
            <span className="text-sm text-muted-foreground">días sin comprar</span>
          </div>
        )}

        {estimado !== null && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl">
            <Users className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
              {estimado} destinatario{estimado !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Resultado */}
      {result && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            Notificación enviada
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg px-3 py-2">
              <div className="text-lg font-bold text-foreground">{result.destinatarios}</div>
              <div className="text-muted-foreground">Destinatarios</div>
            </div>
            <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg px-3 py-2">
              <div className="text-lg font-bold text-green-600">{result.push_enviadas}</div>
              <div className="text-muted-foreground">Push enviadas</div>
            </div>
            {result.push_fallidas > 0 && (
              <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg px-3 py-2">
                <div className="text-lg font-bold text-red-500">{result.push_fallidas}</div>
                <div className="text-muted-foreground">Fallidas</div>
              </div>
            )}
            {result.sin_push > 0 && (
              <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg px-3 py-2">
                <div className="text-lg font-bold text-muted-foreground">{result.sin_push}</div>
                <div className="text-muted-foreground">Sin push</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Botón enviar */}
      <div className="flex justify-end">
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={!canSend || sending}
          size="lg"
          className="w-full sm:w-auto"
        >
          {sending
            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enviando...</>
            : <><Send className="h-4 w-4 mr-2" /> Enviar notificación</>
          }
        </Button>
      </div>

      {/* Dialog confirmación */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar envío</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se enviará a <strong>{estimado ?? "?"} destinatario{(estimado ?? 0) !== 1 ? "s" : ""}</strong>.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={handleSend}>
              <Send className="h-4 w-4 mr-1.5" /> Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
