"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Send,
  Loader2,
  Users,
  User,
  MapPin,
  Shield,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { showAdminToast } from "@/components/admin-toast";
import { supabase } from "@/lib/supabase";
import type { NotificacionPlantilla } from "@/types/database";

const SEG_TYPES = [
  { value: "todos", label: "Todos los clientes", icon: Users },
  { value: "cliente", label: "Cliente específico", icon: User },
  { value: "zona", label: "Por zona de entrega", icon: MapPin },
  { value: "rol", label: "Por rol", icon: Shield },
  { value: "inactividad", label: "Por inactividad", icon: Clock },
];

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

  // Search state
  const [clienteQuery, setClienteQuery] = useState("");
  const [clienteResults, setClienteResults] = useState<any[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<any>(null);
  const [zonas, setZonas] = useState<any[]>([]);
  const [estimado, setEstimado] = useState<number | null>(null);

  const fetchPlantillas = useCallback(async () => {
    try {
      const res = await fetch("/api/notificaciones/plantillas");
      const data = await res.json();
      setPlantillas(data.filter((p: NotificacionPlantilla) => p.activa));
    } catch {}
  }, []);

  useEffect(() => { fetchPlantillas(); }, [fetchPlantillas]);

  useEffect(() => {
    supabase.from("zona_entrega").select("id, nombre").then(({ data }) => {
      if (data) setZonas(data);
    });
  }, []);

  // Search clients
  useEffect(() => {
    if (clienteQuery.length < 2) { setClienteResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("clientes")
        .select("id, nombre, email")
        .eq("activo", true)
        .ilike("nombre", `%${clienteQuery}%`)
        .limit(8);
      setClienteResults(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [clienteQuery]);

  // Estimate recipients
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

  const handlePlantillaChange = (id: string | null) => {
    if (!id) return;
    setPlantillaId(id);
    if (id === "libre") {
      setTitulo("");
      setMensaje("");
      return;
    }
    const p = plantillas.find((x) => x.id === id);
    if (p) {
      setTitulo(p.titulo_template);
      setMensaje(p.mensaje_template);
      setTipo(p.tipo);
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

  const canSend = titulo.trim() && mensaje.trim() && (segTipo !== "cliente" || selectedCliente) && (segTipo !== "zona" || segValor) && (segTipo !== "rol" || segValor) && (segTipo !== "inactividad" || segValor);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Send className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Enviar Notificación</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        {/* Form */}
        <div className="space-y-5 bg-white dark:bg-gray-900 border rounded-xl p-6">
          {/* Template selector */}
          <div>
            <Label>Plantilla (opcional)</Label>
            <Select value={plantillaId || "libre"} onValueChange={handlePlantillaChange}>
              <SelectTrigger><SelectValue placeholder="Seleccionar plantilla..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="libre">Notificación libre</SelectItem>
                {plantillas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título de la notificación" />
          </div>

          <div>
            <Label>Mensaje</Label>
            <Textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Cuerpo del mensaje" rows={4} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
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
              <Label>URL (opcional)</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/cuenta/pedidos" />
            </div>
          </div>

          {/* Segmentation */}
          <div className="border-t pt-4">
            <Label className="text-base font-semibold mb-3 block">Destinatarios</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {SEG_TYPES.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.value}
                    onClick={() => { setSegTipo(s.value); setSegValor(""); setSelectedCliente(null); }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all ${segTipo === s.value ? "border-primary bg-primary/5 text-primary font-medium" : "border-gray-200 hover:border-gray-300"}`}
                  >
                    <Icon className="h-4 w-4" />
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Segmentation value inputs */}
            {segTipo === "cliente" && (
              <div className="relative">
                <Input
                  value={selectedCliente ? selectedCliente.nombre : clienteQuery}
                  onChange={(e) => { setClienteQuery(e.target.value); setSelectedCliente(null); }}
                  placeholder="Buscar cliente por nombre..."
                />
                {clienteResults.length > 0 && !selectedCliente && (
                  <div className="absolute z-10 top-full left-0 right-0 bg-white dark:bg-gray-900 border rounded-lg mt-1 shadow-lg max-h-48 overflow-y-auto">
                    {clienteResults.map((c) => (
                      <button key={c.id} onClick={() => { setSelectedCliente(c); setClienteResults([]); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm">
                        <div className="font-medium">{c.nombre}</div>
                        {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
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
                <Input type="number" value={segValor} onChange={(e) => setSegValor(e.target.value)} placeholder="30" className="w-24" />
                <span className="text-sm text-gray-500">días sin comprar</span>
              </div>
            )}

            {estimado !== null && (
              <div className="mt-3 text-sm text-gray-600 flex items-center gap-1.5">
                <Users className="h-4 w-4" /> {estimado} destinatario{estimado !== 1 ? "s" : ""} estimado{estimado !== 1 ? "s" : ""}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => setConfirmOpen(true)} disabled={!canSend || sending} size="lg">
              {sending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enviando...</> : <><Send className="h-4 w-4 mr-2" /> Enviar notificación</>}
            </Button>
          </div>
        </div>

        {/* Preview + Result */}
        <div className="space-y-4">
          {/* Preview card */}
          <div className="border rounded-xl p-4 bg-white dark:bg-gray-900">
            <Label className="text-xs text-gray-400 uppercase tracking-wide">Vista previa</Label>
            <div className="mt-3 border rounded-lg p-3 bg-gray-50 dark:bg-gray-800">
              <div className="font-semibold text-sm">{titulo || "Título de la notificación"}</div>
              <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{mensaje || "Cuerpo del mensaje..."}</div>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="border rounded-xl p-4 bg-white dark:bg-gray-900 space-y-2">
              <Label className="text-xs text-gray-400 uppercase tracking-wide">Resultado</Label>
              <div className="space-y-1.5 mt-2 text-sm">
                <div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /> {result.destinatarios} destinatarios</div>
                <div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /> {result.push_enviadas} push enviadas</div>
                {result.push_fallidas > 0 && <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-red-500" /> {result.push_fallidas} push fallidas</div>}
                {result.sin_push > 0 && <div className="flex items-center gap-2 text-gray-400"><AlertCircle className="h-4 w-4" /> {result.sin_push} sin push activo</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirmar envío</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">
            Se enviará la notificación a {estimado ?? "?"} destinatario{(estimado ?? 0) !== 1 ? "s" : ""}. ¿Confirmar?
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={handleSend}>Enviar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
