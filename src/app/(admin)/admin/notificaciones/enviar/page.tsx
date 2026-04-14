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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { showAdminToast } from "@/components/admin-toast";
import { supabase } from "@/lib/supabase";
import type { NotificacionPlantilla } from "@/types/database";

const SEG_TYPES = [
  { value: "todos", label: "Todos los clientes", icon: Users },
  { value: "cliente", label: "Cliente específico", icon: User },
  { value: "zona", label: "Por zona", icon: MapPin },
  { value: "rol", label: "Por rol", icon: Shield },
  { value: "inactividad", label: "Inactivos", icon: Clock },
];

const GRUPOS_PLANTILLA = [
  { label: "Pedidos", tipos: ["pedido"], destExcluir: ["admin"] },
  { label: "Promociones", tipos: ["promocion"] },
  { label: "Catálogo", tipos: ["catalogo"] },
  { label: "Cuenta corriente", tipos: ["cuenta_corriente"] },
  { label: "Recordatorios", tipos: ["recordatorio"] },
  { label: "Admin", tipos: ["pedido"], soloAdmin: true },
];

const URL_POR_TIPO: Record<string, string> = {
  pedido: "/cuenta/pedidos",
  promocion: "/productos",
  catalogo: "/productos",
  cuenta_corriente: "/cuenta",
  recordatorio: "/productos",
};

export default function EnviarNotificacionPage() {
  const [plantillas, setPlantillas] = useState<NotificacionPlantilla[]>([]);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<NotificacionPlantilla | null>(null);
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [url, setUrl] = useState("");
  const [tipo, setTipo] = useState("promocion");
  const [segTipo, setSegTipo] = useState("todos");
  const [segValor, setSegValor] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [modoLibre, setModoLibre] = useState(false);

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

  // Horario
  const [horarioCierre, setHorarioCierre] = useState<string | null>(null);

  // Clientes exclusivos del descuento
  const [clientesExclusivos, setClientesExclusivos] = useState<any[]>([]);

  const fetchPlantillas = useCallback(async () => {
    try {
      const res = await fetch("/api/notificaciones/plantillas");
      const data = await res.json();
      setPlantillas(data.filter((p: NotificacionPlantilla) => p.activa));
    } catch {}
  }, []);

  useEffect(() => {
    fetchPlantillas();
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
        const { count } = await supabase.from("clientes").select("*", { count: "exact", head: true }).eq("activo", true).eq("zona_entrega", segValor);
        setEstimado(count ?? 0);
      } else if (segTipo === "rol" && segValor) {
        const { count } = await supabase.from("usuarios").select("*", { count: "exact", head: true }).eq("activo", true).eq("rol", segValor);
        setEstimado(count ?? 0);
      } else if (segTipo === "inactividad") {
        setEstimado(null);
      } else {
        setEstimado(null);
      }
    };
    estimate();
  }, [segTipo, segValor, selectedCliente]);

  const reemplazarVariables = (texto: string, cliente: any): string => {
    const nombre = cliente?.nombre || "";
    const primerNombre = nombre.trim().split(" ")[0] || nombre;
    const horario = horarioCierre
      ? horarioCierre.substring(0, 5).replace(":00", "")
      : "";

    return texto
      .replace(/\{\{nombre\}\}/g, primerNombre)
      .replace(/\{\{horario\}\}/g, horario)
      .replace(/\{\{horario_texto\}\}/g, horario ? ` hasta las ${horario}hs` : "")
      .replace(/\{\{cliente\}\}/g, primerNombre)
      .replace(/\{\{total\}\}/g, "")
      .replace(/\{\{monto_efectivo\}\}/g, "")
      .replace(/\{\{saldo\}\}/g, cliente?.saldo ? `$${Math.round(cliente.saldo).toLocaleString("es-AR")}` : "");
  };

  const handlePlantillaChange = (p: NotificacionPlantilla) => {
    setPlantillaSeleccionada(p);
    setSelectedDescuento(null);
    setClientesExclusivos([]);
    setModoLibre(false);

    if (selectedCliente) {
      setTitulo(reemplazarVariables(p.titulo_template, selectedCliente));
      setMensaje(reemplazarVariables(p.mensaje_template, selectedCliente));
    } else {
      setTitulo(p.titulo_template);
      setMensaje(p.mensaje_template);
    }
    setTipo(p.tipo);
    setUrl(URL_POR_TIPO[p.tipo] || "");
  };

  const handleClienteSelect = (cliente: any) => {
    setSelectedCliente(cliente);
    setClienteResults([]);
    if (plantillaSeleccionada) {
      setTitulo(reemplazarVariables(plantillaSeleccionada.titulo_template, cliente));
      setMensaje(reemplazarVariables(plantillaSeleccionada.mensaje_template, cliente));
    }
  };

  const handleDescuentoSelect = async (desc: any) => {
    setSelectedDescuento(desc);
    const esExclusivo = desc.clientes_ids && desc.clientes_ids.length > 0;
    const primerNombre = selectedCliente
      ? selectedCliente.nombre.trim().split(" ")[0]
      : "{{nombre}}";
    const pct = desc.porcentaje ? `${desc.porcentaje}%` : "";
    const vence = desc.fecha_fin
      ? new Date(desc.fecha_fin + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })
      : null;
    const venceTexto = vence ? ` Válido hasta el ${vence}.` : "";

    if (esExclusivo) {
      // Cargar nombres de los clientes exclusivos
      const { data } = await supabase
        .from("clientes")
        .select("id, nombre")
        .in("id", desc.clientes_ids);
      setClientesExclusivos(data || []);
      // Cambiar segmentación automáticamente a clientes exclusivos
      setSegTipo("todos"); // se sobreescribe en handleSend
      setTitulo(`${primerNombre}, tenés un descuento exclusivo`);
      setMensaje(`Hola ${primerNombre}, tenés un ${pct} de descuento exclusivo.${venceTexto} ¡Aprovechalo!`);
    } else {
      setClientesExclusivos([]);
      setTitulo(`¡${pct} de descuento hoy!`);
      setMensaje(`Hola ${primerNombre}, aprovechá el ${pct} de descuento.${venceTexto} ¡Entrá a ver qué hay!`);
    }
    setTipo("promocion");
    setUrl("/productos");
  };

  const limpiarPlantilla = () => {
    setPlantillaSeleccionada(null);
    setSelectedDescuento(null);
    setClientesExclusivos([]);
    setTitulo("");
    setMensaje("");
    setUrl("");
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

      // Si el descuento tiene clientes exclusivos, enviar solo a ellos
      if (selectedDescuento?.clientes_ids?.length > 0) {
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
          plantilla_id: plantillaSeleccionada?.id || null,
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

  // Agrupar plantillas
  const plantillasPorGrupo = [
    {
      label: "Pedidos",
      items: plantillas.filter(p => p.tipo === "pedido" && p.destinatario_default !== "admin"),
    },
    {
      label: "Promociones",
      items: plantillas.filter(p => p.tipo === "promocion"),
    },
    {
      label: "Catálogo",
      items: plantillas.filter(p => p.tipo === "catalogo"),
    },
    {
      label: "Cuenta corriente",
      items: plantillas.filter(p => p.tipo === "cuenta_corriente"),
    },
    {
      label: "Recordatorios",
      items: plantillas.filter(p => p.tipo === "recordatorio"),
    },
    {
      label: "Admin",
      items: plantillas.filter(p => p.destinatario_default === "admin"),
    },
  ].filter(g => g.items.length > 0);

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-xs flex items-center justify-center shrink-0 font-semibold">1</span>
            Contenido
          </div>
          {!modoLibre && !plantillaSeleccionada && (
            <button
              onClick={() => { setModoLibre(true); limpiarPlantilla(); }}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Escribir sin plantilla
            </button>
          )}
          {(modoLibre || plantillaSeleccionada) && (
            <button
              onClick={() => { setModoLibre(false); limpiarPlantilla(); }}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Usar plantilla
            </button>
          )}
        </div>

        {/* Selector de plantilla */}
        {!modoLibre && !plantillaSeleccionada && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Elegí una plantilla</label>
            <div className="border rounded-xl overflow-hidden divide-y max-h-72 overflow-y-auto">
              {plantillasPorGrupo.map((grupo) => (
                <div key={grupo.label}>
                  <div className="px-3 py-1.5 bg-muted/40 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {grupo.label}
                  </div>
                  {grupo.items.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handlePlantillaChange(p)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors border-b last:border-0"
                    >
                      <div className="text-sm font-medium text-foreground">{p.nombre}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">{p.titulo_template}</div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plantilla seleccionada */}
        {plantillaSeleccionada && (
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-xl">
            <div className="min-w-0">
              <div className="text-sm font-medium text-blue-800 dark:text-blue-200 truncate">{plantillaSeleccionada.nombre}</div>
              <div className="text-xs text-blue-600/70 dark:text-blue-400 mt-0.5">
                {plantillaSeleccionada.tipo} · {url || "sin URL"}
              </div>
            </div>
            <button onClick={limpiarPlantilla} className="shrink-0 text-blue-400 hover:text-blue-600 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Selector de descuento — solo si tipo es promocion */}
        {(plantillaSeleccionada?.tipo === "promocion" || (modoLibre && tipo === "promocion")) && (
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">
              Descuento vigente <span className="text-muted-foreground/60">(opcional — autocompleta el mensaje)</span>
            </label>
            <select
              value={selectedDescuento?.id || ""}
              onChange={(e) => {
                const desc = descuentos.find(d => d.id === e.target.value);
                if (desc) handleDescuentoSelect(desc);
                else { setSelectedDescuento(null); setClientesExclusivos([]); }
              }}
              className="w-full text-sm px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 text-foreground border-border"
            >
              <option value="">Sin descuento específico</option>
              {descuentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre} — {d.porcentaje}% off
                  {d.clientes_ids?.length > 0 ? " (Exclusivo)" : ""}
                  {d.fecha_fin ? ` · hasta ${new Date(d.fecha_fin + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}` : ""}
                </option>
              ))}
            </select>

            {/* Chip del descuento seleccionado */}
            {selectedDescuento && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 rounded-lg">
                <Tag className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <span className="text-xs text-green-700 dark:text-green-400 font-medium flex-1">
                  {selectedDescuento.nombre} — {selectedDescuento.porcentaje}% off
                  {clientesExclusivos.length > 0 && ` · ${clientesExclusivos.length} clientes exclusivos`}
                </span>
                <button onClick={() => { setSelectedDescuento(null); setClientesExclusivos([]); }} className="text-green-500 hover:text-green-700 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Lista de clientes exclusivos */}
            {clientesExclusivos.length > 0 && (
              <div className="mt-2 px-3 py-2 bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900 rounded-lg">
                <div className="text-xs font-medium text-purple-700 dark:text-purple-400 mb-1">
                  Se enviará solo a estos clientes:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {clientesExclusivos.map((c) => (
                    <span key={c.id} className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
                      {c.nombre}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Título y mensaje — visibles si hay plantilla o modo libre */}
        {(plantillaSeleccionada || modoLibre) && (
          <>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Título</label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título de la notificación" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Mensaje</label>
              <Textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={3} placeholder="Cuerpo del mensaje..." />
            </div>

            {/* Tipo y URL — solo en modo libre */}
            {modoLibre && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Tipo</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value)}
                    className="w-full text-sm px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 text-foreground border-border"
                  >
                    <option value="pedido">Pedido</option>
                    <option value="promocion">Promoción</option>
                    <option value="recordatorio">Recordatorio</option>
                    <option value="catalogo">Catálogo</option>
                    <option value="cuenta_corriente">Cuenta Corriente</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">URL destino (opcional)</label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/productos" />
                </div>
              </div>
            )}

            {/* Vista previa */}
            {(titulo || mensaje) && (
              <div className="bg-muted/50 rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Vista previa</span>
                </div>
                <div className="text-sm font-semibold text-foreground">{titulo}</div>
                <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{mensaje}</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Card 2 — Destinatarios */}
      {(plantillaSeleccionada || modoLibre) && (
        <div className="bg-white dark:bg-gray-900 border rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-xs flex items-center justify-center shrink-0 font-semibold">2</span>
            ¿A quién le llega?
          </div>

          {/* Si hay descuento exclusivo, mostrar aviso */}
          {clientesExclusivos.length > 0 ? (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-purple-50 dark:bg-purple-950/20 rounded-xl">
              <Users className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-400">
                Solo a los {clientesExclusivos.length} clientes del descuento exclusivo
              </span>
            </div>
          ) : (
            <>
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
                      {s.label}
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
                <select
                  value={segValor}
                  onChange={(e) => setSegValor(e.target.value)}
                  className="w-full text-sm px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 text-foreground border-border"
                >
                  <option value="">Seleccionar zona...</option>
                  {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
                </select>
              )}

              {segTipo === "rol" && (
                <select
                  value={segValor}
                  onChange={(e) => setSegValor(e.target.value)}
                  className="w-full text-sm px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 text-foreground border-border"
                >
                  <option value="">Seleccionar rol...</option>
                  <option value="admin">Admin</option>
                  <option value="vendedor">Vendedor</option>
                  <option value="repartidor">Repartidor</option>
                </select>
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
            </>
          )}
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            Notificación enviada
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg px-3 py-2">
              <div className="text-lg font-bold text-foreground">{result.destinatarios}</div>
              <div className="text-muted-foreground">Destinatarios</div>
            </div>
            <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg px-3 py-2">
              <div className="text-lg font-bold text-green-600">{result.push_enviadas}</div>
              <div className="text-muted-foreground">Push enviadas</div>
            </div>
            <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg px-3 py-2">
              <div className="text-lg font-bold text-muted-foreground">{result.sin_push}</div>
              <div className="text-muted-foreground">Sin push</div>
            </div>
          </div>
        </div>
      )}

      {/* Botón enviar */}
      {(plantillaSeleccionada || modoLibre) && (
        <div className="flex justify-end">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!canSend || sending}
            size="lg"
            className="w-full sm:w-auto"
          >
            {sending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando...</>
              : <><Send className="h-4 w-4 mr-2" />Enviar notificación</>
            }
          </Button>
        </div>
      )}

      {/* Dialog confirmación */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirmar envío</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {clientesExclusivos.length > 0
              ? <>Se enviará a <strong>{clientesExclusivos.length} clientes exclusivos</strong> del descuento.</>
              : <>Se enviará a <strong>{estimado ?? "?"} destinatario{(estimado ?? 0) !== 1 ? "s" : ""}</strong>.</>
            }
          </p>
          <div className="bg-muted/50 rounded-lg p-3 mt-1">
            <div className="text-xs font-semibold text-foreground">{titulo}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{mensaje}</div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={handleSend}>
              <Send className="h-4 w-4 mr-1.5" />Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
