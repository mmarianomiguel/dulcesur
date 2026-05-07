"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { showAdminToast } from "@/components/admin-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Search, Loader2, AlertTriangle, X, PackageSearch, Package, Printer, Download, Ban,
} from "lucide-react";
import { todayARG, currentMonthPadded } from "@/lib/formatters";
import { logAudit } from "@/lib/audit";
import { APP_NAME } from "@/lib/constants";

/* ─── Types ─── */
interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  stock: number;
  costo: number;
  unidad_medida?: string;
}

interface AjusteRow {
  producto_id: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  costo: number;
  subtotal: number;
  motivo: string;
  comentario: string;
  presentacion?: string;
  unidades_por_presentacion?: number;
  cajas?: number;
  sueltas?: number;
  direccion?: "in" | "out";
}

interface PresData {
  id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  costo: number;
  precio: number;
}

interface Ajuste {
  id: string;
  fecha: string;
  motivo: string;
  observacion: string | null;
  usuario: string | null;
  anulado?: boolean;
  anulado_at?: string | null;
  anulado_por?: string | null;
  anulado_motivo?: string | null;
}

const MOTIVOS_GLOBALES = [
  "Mercadería defectuosa",
  "Mercadería vencida",
  "Consumo interno",
  "Venta al costo",
  "Robo interno",
  "Robo por agentes externos",
  "Diferencia de inventario",
];

const MOTIVOS_ITEM = [
  "Mercadería defectuosa",
  "Mercadería vencida",
  "Consumo interno",
  "Robo interno",
  "Robo por agentes externos",
  "Diferencia de inventario",
  "Otro",
];



function formatDate(fecha: string) {
  return new Date(fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ─── Detail dialog (printable comprobante) ─── */
function AjusteDetailDialog({
  ajuste,
  items,
  onClose,
  onAnular,
  autoAction,
  onAutoActionConsumed,
}: {
  ajuste: Ajuste;
  items: any[];
  onClose: () => void;
  onAnular: (motivo: string) => Promise<void>;
  autoAction?: "print" | "pdf" | "anular" | null;
  onAutoActionConsumed?: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [savingPdf, setSavingPdf] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [anulando, setAnulando] = useState(false);
  const numero = ajuste.id.slice(0, 8).toUpperCase();
  const isIntercambio = ajuste.motivo === "Intercambio";
  const isAnulado = !!ajuste.anulado;
  const total = items.reduce((a, it) => a + (Number(it.subtotal) || 0), 0);
  const totalCantidad = items.reduce((a, it) => a + (Number(it.cantidad) || 0), 0);
  const fileName = `Ajuste-${numero}-${ajuste.fecha}`;

  const submitAnular = async () => {
    setAnulando(true);
    try {
      await onAnular(motivoAnulacion.trim());
    } finally {
      setAnulando(false);
      setConfirmOpen(false);
    }
  };

  // Auto-action triggered desde el context menu (print / pdf / anular)
  // Espera un tick para que el printRef esté montado y los items cargados.
  useEffect(() => {
    if (!autoAction || items.length === 0) return;
    const t = setTimeout(() => {
      if (autoAction === "print") handlePrint();
      else if (autoAction === "pdf") handlePdf();
      else if (autoAction === "anular" && !isAnulado) {
        setMotivoAnulacion("");
        setConfirmOpen(true);
      }
      onAutoActionConsumed?.();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAction, items.length]);

  const handlePrint = () => {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<!DOCTYPE html><html><head><title>${fileName}</title><style>@page{size:A4;margin:14mm}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${content}</body></html>`
    );
    w.document.close();
    w.focus();
    w.onload = () => { w.print(); w.close(); };
  };

  const handlePdf = async () => {
    if (!printRef.current) return;
    setSavingPdf(true);
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const { jsPDF } = await import("jspdf");
      const clone = printRef.current.cloneNode(true) as HTMLElement;
      clone.style.transform = "none";
      clone.style.width = "210mm";
      clone.style.position = "absolute";
      clone.style.left = "-9999px";
      document.body.appendChild(clone);
      const canvas = await html2canvas(clone, { scale: 2, useCORS: true });
      document.body.removeChild(clone);
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
      pdf.save(`${fileName}.pdf`);
    } catch (err) {
      console.error("PDF generation failed, fallback a imprimir:", err);
      handlePrint();
    } finally {
      setSavingPdf(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-5 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Printer className="w-4 h-4" />
            Comprobante de ajuste — N.º {numero}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto bg-muted/30 p-5">
          {/* Printable area — estilo factura, todo inline para PDF/print */}
          <div
            ref={printRef}
            style={{
              background: "#fff",
              maxWidth: "780px",
              margin: "0 auto",
              padding: "30px 34px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: "12px",
              color: "#000",
              lineHeight: 1.35,
              border: "1px solid #d4d4d4",
            }}
          >
            {/* ===== Encabezado tipo factura ===== */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px" }}>
              <tbody>
                <tr>
                  {/* Emisor */}
                  <td style={{ width: "55%", verticalAlign: "top", paddingRight: "8px" }}>
                    <div style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "0.5px" }}>{APP_NAME}</div>
                    <div style={{ fontSize: "10px", color: "#555", marginTop: "3px" }}>Comprobante interno de movimiento de mercadería</div>
                    <div style={{ fontSize: "10px", color: "#555", marginTop: "2px" }}>Documento sin valor fiscal</div>
                  </td>
                  {/* Letra X (no fiscal) — caja centrada al estilo factura */}
                  <td style={{ width: "10%", verticalAlign: "top", textAlign: "center", borderLeft: "1px solid #999", borderRight: "1px solid #999", padding: "4px 0" }}>
                    <div style={{ fontSize: "32px", fontWeight: 700, lineHeight: 1, marginTop: "4px" }}>X</div>
                    <div style={{ fontSize: "8px", color: "#555", marginTop: "4px", letterSpacing: "0.5px" }}>DOC. NO FISCAL</div>
                  </td>
                  {/* Datos comprobante */}
                  <td style={{ width: "35%", verticalAlign: "top", paddingLeft: "10px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                      {isIntercambio ? "Intercambio de stock" : "Ajuste de stock"}
                    </div>
                    <div style={{ fontSize: "10px", marginTop: "6px" }}>
                      <span style={{ color: "#555" }}>N.º </span>
                      <span style={{ fontFamily: "Consolas, monospace", fontWeight: 700 }}>{numero}</span>
                    </div>
                    <div style={{ fontSize: "10px", marginTop: "2px" }}>
                      <span style={{ color: "#555" }}>Fecha de emisión: </span>
                      <span style={{ fontWeight: 600 }}>{formatDate(ajuste.fecha)}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ borderTop: "2px solid #000", marginBottom: "12px" }} />

            {isAnulado && (
              <div style={{ position: "relative", marginBottom: "12px" }}>
                <div
                  style={{
                    border: "2px solid #b91c1c",
                    background: "#fef2f2",
                    color: "#7f1d1d",
                    padding: "8px 12px",
                    fontSize: "11px",
                    fontWeight: 600,
                    textAlign: "center",
                    letterSpacing: "0.5px",
                  }}
                >
                  ANULADO
                  {ajuste.anulado_at && (
                    <span style={{ fontWeight: 400 }}>
                      {" "} · {new Date(ajuste.anulado_at).toLocaleString("es-AR")}
                    </span>
                  )}
                  {ajuste.anulado_por && (
                    <span style={{ fontWeight: 400 }}>
                      {" "} · por {ajuste.anulado_por}
                    </span>
                  )}
                  {ajuste.anulado_motivo && (
                    <div style={{ fontSize: "10px", fontWeight: 400, marginTop: "3px" }}>
                      {ajuste.anulado_motivo}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===== Bloque Emisor / Destinatario ===== */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
              <tbody>
                <tr>
                  <td style={{ width: "50%", verticalAlign: "top", border: "1px solid #999", padding: "8px 10px" }}>
                    <div style={{ fontSize: "9px", color: "#666", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "3px" }}>Emisor</div>
                    <div style={{ fontSize: "11px", fontWeight: 700 }}>{APP_NAME}</div>
                    <div style={{ fontSize: "10px", color: "#444", marginTop: "4px" }}>
                      <strong>Responsable:</strong> {ajuste.usuario || "—"}
                    </div>
                    <div style={{ fontSize: "10px", color: "#444" }}>
                      <strong>Concepto:</strong> {ajuste.motivo}
                    </div>
                  </td>
                  <td style={{ width: "50%", verticalAlign: "top", border: "1px solid #999", borderLeft: "none", padding: "8px 10px" }}>
                    <div style={{ fontSize: "9px", color: "#666", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "3px" }}>Destinatario / Observaciones</div>
                    <div style={{ fontSize: "10px", color: "#222", whiteSpace: "pre-wrap", minHeight: "32px" }}>
                      {ajuste.observacion || "—"}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ===== Tabla de ítems ===== */}
            <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse", border: "1px solid #999" }}>
              <thead>
                <tr style={{ background: "#e8e8e8" }}>
                  <th style={{ textAlign: "center", padding: "6px 6px", fontSize: "10px", fontWeight: 700, borderBottom: "1px solid #999", borderRight: "1px solid #ccc", width: "40px" }}>Cant.</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontSize: "10px", fontWeight: 700, borderBottom: "1px solid #999", borderRight: "1px solid #ccc" }}>Descripción</th>
                  <th style={{ textAlign: "left", padding: "6px 6px", fontSize: "10px", fontWeight: 700, borderBottom: "1px solid #999", borderRight: "1px solid #ccc", width: "95px" }}>Código</th>
                  <th style={{ textAlign: "right", padding: "6px 6px", fontSize: "10px", fontWeight: 700, borderBottom: "1px solid #999", borderRight: "1px solid #ccc", width: "95px" }}>P. Unitario</th>
                  <th style={{ textAlign: "right", padding: "6px 6px", fontSize: "10px", fontWeight: 700, borderBottom: "1px solid #999", width: "100px" }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} style={{ borderBottom: i < items.length - 1 ? "1px solid #eee" : "none", verticalAlign: "top" }}>
                    <td style={{ padding: "7px 6px", textAlign: "center", borderRight: "1px solid #eee", fontVariantNumeric: "tabular-nums" }}>{it.cantidad}</td>
                    <td style={{ padding: "7px 8px", borderRight: "1px solid #eee" }}>
                      <div style={{ fontWeight: 500 }}>
                        {it.direccion === "out" && <span style={{ fontSize: "8px", fontWeight: 700, padding: "1px 4px", marginRight: "5px", border: "1px solid #b91c1c", color: "#b91c1c", borderRadius: "2px" }}>SALE</span>}
                        {it.direccion === "in" && <span style={{ fontSize: "8px", fontWeight: 700, padding: "1px 4px", marginRight: "5px", border: "1px solid #047857", color: "#047857", borderRadius: "2px" }}>ENTRA</span>}
                        {it.producto?.nombre || it.producto_id}
                      </div>
                    </td>
                    <td style={{ padding: "7px 6px", borderRight: "1px solid #eee", fontFamily: "Consolas, monospace", fontSize: "10px", color: "#555" }}>
                      {it.producto?.codigo || "—"}
                    </td>
                    <td style={{ padding: "7px 6px", textAlign: "right", borderRight: "1px solid #eee", fontVariantNumeric: "tabular-nums" }}>
                      {it.costo != null ? formatCurrency(it.costo) : "—"}
                    </td>
                    <td style={{ padding: "7px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                      {it.subtotal != null ? formatCurrency(it.subtotal) : "—"}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "24px 8px", textAlign: "center", color: "#999" }}>Sin items</td></tr>
                )}
              </tbody>
            </table>

            {/* ===== Totales ===== */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
              <tbody>
                <tr>
                  <td style={{ width: "55%", verticalAlign: "top", fontSize: "10px", color: "#555", paddingTop: "6px" }}>
                    {items.length} {items.length === 1 ? "ítem" : "ítems"} · {totalCantidad} unidades en total
                  </td>
                  <td style={{ width: "45%", verticalAlign: "top" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #999" }}>
                      <tbody>
                        <tr>
                          <td style={{ padding: "6px 10px", fontSize: "10px", color: "#444", borderBottom: "1px solid #ddd" }}>Subtotal</td>
                          <td style={{ padding: "6px 10px", fontSize: "11px", textAlign: "right", fontVariantNumeric: "tabular-nums", borderBottom: "1px solid #ddd" }}>{formatCurrency(total)}</td>
                        </tr>
                        <tr style={{ background: "#f4f4f4" }}>
                          <td style={{ padding: "8px 10px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Total</td>
                          <td style={{ padding: "8px 10px", fontSize: "15px", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ===== Pie ===== */}
            <div style={{ marginTop: "22px", paddingTop: "8px", borderTop: "1px solid #ccc", fontSize: "9px", color: "#777", display: "flex", justifyContent: "space-between" }}>
              <span>Generado el {new Date().toLocaleString("es-AR")}</span>
              <span>Documento sin valor fiscal · {APP_NAME}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t shrink-0 bg-card">
          {!isAnulado && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setMotivoAnulacion(""); setConfirmOpen(true); }}
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <Ban className="w-4 h-4 mr-1" /> Anular ajuste
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="w-4 h-4 mr-1" /> Cerrar
          </Button>
          <Button variant="outline" size="sm" onClick={handlePdf} disabled={savingPdf}>
            {savingPdf ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            PDF
          </Button>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1" /> Imprimir
          </Button>
        </div>
      </DialogContent>

      {/* Confirmación de anulación */}
      <Dialog open={confirmOpen} onOpenChange={(v) => !v && !anulando && setConfirmOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="w-4 h-4" /> Anular ajuste N.º {numero}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Se va a <strong>revertir el stock</strong> de los {items.length} {items.length === 1 ? "ítem" : "ítems"} de
              este ajuste y queda registrada la anulación. Esta acción no se puede deshacer.
            </p>
            {isIntercambio && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Es un intercambio: la reversa hace volver al stock las salidas y descontar las entradas.
              </p>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Motivo de anulación (opcional)</label>
              <Input
                value={motivoAnulacion}
                onChange={(e) => setMotivoAnulacion(e.target.value)}
                placeholder="Ej: cargué el producto equivocado"
                disabled={anulando}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={anulando}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={submitAnular}
              disabled={anulando}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {anulando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Ban className="w-4 h-4 mr-1" />}
              Confirmar anulación
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

/* ─── Main component ─── */
export default function AjustesStockPage() {
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [currentUserName, setCurrentUserName] = useState("Admin");

  // Fetch current user name from auth + usuarios table
  const userFetched = useRef(false);
  useEffect(() => {
    if (userFetched.current) return;
    userFetched.current = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: usuario } = await supabase
          .from("usuarios")
          .select("nombre")
          .eq("auth_id", user.id)
          .single();
        if (usuario?.nombre) setCurrentUserName(usuario.nombre);
      } catch (err) { console.error("Error loading stock:", err); }
    })();
  }, []);

  // Form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fecha, setFecha] = useState(todayARG());
  const [usuario, setUsuario] = useState(currentUserName);
  const [motivoGlobal, setMotivoGlobal] = useState(MOTIVOS_GLOBALES[0]);
  const [observacion, setObservacion] = useState("");
  const [rows, setRows] = useState<AjusteRow[]>([]);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [tipoAjuste, setTipoAjuste] = useState<"egreso" | "ingreso" | "intercambio">("egreso");
  const [addDireccion, setAddDireccion] = useState<"in" | "out">("out");

  // Product search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHl, setSearchHl] = useState(0);
  const [searchPresIdx, setSearchPresIdx] = useState(-1); // -1 = Unidad, 0+ = pres index
  const [productSearch, setProductSearch] = useState("");

  // Filters
  const [filterMode, setFilterMode] = useState<"day" | "month" | "range" | "all">("range");
  const [filterDay, setFilterDay] = useState(todayARG());
  const [filterMonth, setFilterMonth] = useState(currentMonthPadded());
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterFrom, setFilterFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [filterTo, setFilterTo] = useState(todayARG());

  // Detail
  const [detailAjuste, setDetailAjuste] = useState<Ajuste | null>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);
  const [detailAutoAction, setDetailAutoAction] = useState<"print" | "pdf" | "anular" | null>(null);

  // Context menu (right-click) on the ajustes list
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ajuste: Ajuste } | null>(null);

  const codigoInputRef = useRef<HTMLInputElement>(null);
  const [presMap, setPresMap] = useState<Record<string, PresData[]>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    let ajQuery = supabase.from("ajustes_stock").select("*").order("created_at", { ascending: false }).limit(200);

    if (filterMode === "day") {
      ajQuery = ajQuery.eq("fecha", filterDay);
    } else if (filterMode === "month") {
      const m = filterMonth.padStart(2, "0");
      const start = `${filterYear}-${m}-01`;
      const nextMonth = Number(filterMonth) === 12 ? 1 : Number(filterMonth) + 1;
      const nextYear = Number(filterMonth) === 12 ? Number(filterYear) + 1 : Number(filterYear);
      const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
      ajQuery = ajQuery.gte("fecha", start).lt("fecha", end);
    } else if (filterMode === "range" && filterFrom && filterTo) {
      ajQuery = ajQuery.gte("fecha", filterFrom).lte("fecha", filterTo);
    }

    const [{ data: aj }, { data: prods }, { data: presData }] = await Promise.all([
      ajQuery,
      supabase.from("productos").select("id, codigo, codigos_adicionales, nombre, stock, costo, unidad_medida, imagen_url").eq("activo", true).order("nombre").limit(10000),
      supabase.from("presentaciones").select("id, producto_id, nombre, cantidad, costo, precio").gt("cantidad", 1).limit(5000),
    ]);
    setAjustes((aj as Ajuste[]) || []);
    setProductos((prods as Producto[]) || []);
    const pm: Record<string, PresData[]> = {};
    (presData || []).forEach((p: any) => { if (!pm[p.producto_id]) pm[p.producto_id] = []; pm[p.producto_id].push(p); });
    setPresMap(pm);
    setLoading(false);
  }, [filterMode, filterDay, filterMonth, filterYear, filterFrom, filterTo]);

  useEffect(() => {
    fetchData();
    const onFocus = () => fetchData();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchData]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!dialogOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "F1") { e.preventDefault(); setSearchOpen(true); return; }

      // Don't intercept if typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (searchOpen) return;

      const len = rows.length;
      if (len === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedRowIdx((prev) => {
          const next = prev === null ? 0 : Math.min(prev + 1, len - 1);
          setTimeout(() => {
            document.querySelectorAll("[data-ajuste-row]")[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }, 0);
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedRowIdx((prev) => {
          const next = prev === null ? 0 : Math.max(prev - 1, 0);
          setTimeout(() => {
            document.querySelectorAll("[data-ajuste-row]")[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }, 0);
          return next;
        });
      } else if (e.key === "ArrowRight" || e.key === "+") {
        e.preventDefault();
        if (selectedRowIdx === null || selectedRowIdx >= len) return;
        setRows((prev) => prev.map((r, i) => {
          if (i !== selectedRowIdx) return r;
          const upp = r.unidades_por_presentacion || 1;
          if (upp > 1) {
            const newCajas = (r.cajas || 0) + 1;
            const cantidad = newCajas * upp + (r.sueltas || 0);
            return { ...r, cajas: newCajas, cantidad, subtotal: cantidad * r.costo };
          }
          const newSueltas = (r.sueltas || 0) + 1;
          return { ...r, sueltas: newSueltas, cantidad: newSueltas, subtotal: newSueltas * r.costo };
        }));
      } else if (e.key === "ArrowLeft" || e.key === "-") {
        e.preventDefault();
        if (selectedRowIdx === null || selectedRowIdx >= len) return;
        setRows((prev) => prev.map((r, i) => {
          if (i !== selectedRowIdx) return r;
          const upp = r.unidades_por_presentacion || 1;
          if (upp > 1) {
            const newCajas = Math.max(0, (r.cajas || 0) - 1);
            const cantidad = newCajas * upp + (r.sueltas || 0);
            return { ...r, cajas: newCajas, cantidad, subtotal: cantidad * r.costo };
          }
          const newSueltas = Math.max(0, (r.sueltas || 0) - 1);
          return { ...r, sueltas: newSueltas, cantidad: newSueltas, subtotal: newSueltas * r.costo };
        }));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedRowIdx !== null && selectedRowIdx < len) {
          setRows((prev) => prev.filter((_, i) => i !== selectedRowIdx));
          setSelectedRowIdx((prev) => prev !== null && prev >= len - 1 ? Math.max(0, len - 2) : prev);
        }
      } else if (e.key === "Escape") {
        setSelectedRowIdx(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialogOpen, rows.length, selectedRowIdx, searchOpen]);

  // Close context menu on click outside / scroll / Escape
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  // Auto-scroll & select last row when a new product is added
  const prevRowsLen = useRef(0);
  useEffect(() => {
    if (rows.length > prevRowsLen.current) {
      const lastIdx = rows.length - 1;
      setSelectedRowIdx(lastIdx);
      setTimeout(() => {
        document.querySelectorAll("[data-ajuste-row]")[lastIdx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 50);
    }
    prevRowsLen.current = rows.length;
  }, [rows.length]);

  const openNew = () => {
    setFecha(todayARG());
    setUsuario(currentUserName);
    setMotivoGlobal(MOTIVOS_GLOBALES[0]);
    setObservacion("");
    setTipoAjuste("egreso");
    setAddDireccion("out");
    setRows([]);
    setSelectedRowIdx(null);
    setDialogOpen(true);
  };

  const addProduct = (p: Producto, pres?: PresData) => {
    const motivo = motivoGlobal === MOTIVOS_GLOBALES[0] ? "" : motivoGlobal;
    const upp = pres ? pres.cantidad : 1;
    const hasCaja = upp > 1;
    // Costo per unit (always). If pres has cost-per-package, divide.
    const costoPorUnidad = pres
      ? (pres.costo ? pres.costo / upp : (p.costo || 0))
      : (p.costo || 0);
    const direccion: "in" | "out" | undefined = tipoAjuste === "intercambio" ? addDireccion : undefined;
    // Default: 1 caja if has upp, else 1 suelta
    const defaultCajas = hasCaja ? 1 : 0;
    const defaultSueltas = hasCaja ? 0 : 1;
    const defaultCantidad = defaultCajas * upp + defaultSueltas;
    setRows((prev) => {
      const existing = prev.findIndex((r) =>
        r.producto_id === p.id &&
        (r.unidades_por_presentacion || 1) === upp &&
        (r.direccion || null) === (direccion || null)
      );
      if (existing >= 0) {
        const next = [...prev];
        const newCajas = (next[existing].cajas || 0) + defaultCajas;
        const newSueltas = (next[existing].sueltas || 0) + defaultSueltas;
        const newQty = newCajas * upp + newSueltas;
        next[existing] = {
          ...next[existing],
          cajas: newCajas,
          sueltas: newSueltas,
          cantidad: newQty,
          subtotal: newQty * next[existing].costo,
        };
        return next;
      }
      return [...prev, {
        producto_id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        cantidad: defaultCantidad,
        unidad: p.unidad_medida || "UN",
        costo: costoPorUnidad,
        subtotal: defaultCantidad * costoPorUnidad,
        motivo,
        comentario: "",
        presentacion: pres ? pres.nombre : "Unidad",
        unidades_por_presentacion: upp,
        cajas: defaultCajas,
        sueltas: defaultSueltas,
        direccion,
      }];
    });
    setSearchOpen(false);
    setProductSearch("");
  };

  const updateRow = <K extends keyof AjusteRow>(idx: number, key: K, value: AjusteRow[K]) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      if (key === "cantidad" || key === "costo") {
        const qty = key === "cantidad" ? Number(value) : next[idx].cantidad;
        const cost = key === "costo" ? Number(value) : next[idx].costo;
        next[idx].subtotal = qty * cost;
      }
      return next;
    });
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setSelectedRowIdx(null);
  };

  const total = rows.reduce((a, r) => a + r.subtotal, 0);

  const handleSave = async () => {
    if (rows.length === 0) return;
    // Validation: intercambio must have at least one in and one out
    if (tipoAjuste === "intercambio") {
      const hasOut = rows.some((r) => r.direccion === "out" && r.cantidad > 0);
      const hasIn = rows.some((r) => r.direccion === "in" && r.cantidad > 0);
      if (!hasOut || !hasIn) {
        showAdminToast("Intercambio: cargá al menos un producto que SALE y uno que ENTRA", "error");
        return;
      }
      if (!observacion.trim()) {
        showAdminToast("Intercambio: la observación es obligatoria (describí la contraparte)", "error");
        return;
      }
    }
    setSaving(true);

    const motivoHeader = tipoAjuste === "intercambio" ? "Intercambio" : motivoGlobal;
    const { data: ajuste, error: ajusteError } = await supabase.from("ajustes_stock").insert({
      fecha, motivo: motivoHeader, observacion: observacion || null, usuario,
    }).select("id").single();

    if (ajusteError) {
      showAdminToast(`Error al crear ajuste: ${ajusteError.message}`, "error");
      setSaving(false);
      return;
    }

    if (ajuste) {
      for (const row of rows) {
        if (row.cantidad <= 0) continue;
        const prod = productos.find((p) => p.id === row.producto_id);
        if (!prod) continue;
        // cantidad is already total units (cajas * upp + sueltas)
        const totalUnits = row.cantidad;

        // Sign of the stock delta and tipo for stock_movimientos
        let delta: number;
        let tipoMov: string;
        if (tipoAjuste === "intercambio") {
          delta = row.direccion === "in" ? totalUnits : -totalUnits;
          tipoMov = "intercambio";
        } else if (tipoAjuste === "ingreso") {
          delta = totalUnits;
          tipoMov = "ajuste_ingreso";
        } else {
          delta = -totalUnits;
          tipoMov = "ajuste_egreso";
        }

        // En ajustes de stock permitimos stock negativo para poder registrar faltantes
        // que luego se reponen al ingresar mercadería.
        const { data: stockResult } = await supabase.rpc("atomic_update_stock", {
          p_producto_id: row.producto_id,
          p_change: delta,
          p_allow_negative: true,
        });

        const stockAntes = stockResult?.stock_antes ?? prod.stock;
        const stockDespues = stockResult?.stock_despues ?? (prod.stock + delta);

        if (delta < 0 && stockDespues < 0) {
          showAdminToast(`${prod.nombre} queda con stock negativo (${stockDespues}). Se repone al ingresar mercadería.`, "info");
        }

        await supabase.from("ajuste_stock_items").insert({
          ajuste_id: ajuste.id,
          producto_id: row.producto_id,
          cantidad: row.cantidad,
          stock_antes: stockAntes,
          stock_despues: stockDespues,
          direccion: row.direccion || null,
          costo: row.costo,
          subtotal: row.subtotal,
        });

        const descBase = tipoAjuste === "intercambio"
          ? `Intercambio ${row.direccion === "in" ? "entra" : "sale"}`
          : motivoGlobal;
        // Human-friendly qty breakdown: "2×15 + 3"
        const upp = row.unidades_por_presentacion || 1;
        const qtyDesc = upp > 1 && (row.cajas || 0) > 0
          ? ` (${row.cajas}×${upp}${(row.sueltas || 0) > 0 ? `+${row.sueltas}` : ""} = ${totalUnits} un.)`
          : ` (${totalUnits} un.)`;
        await supabase.from("stock_movimientos").insert({
          producto_id: row.producto_id,
          tipo: tipoMov,
          cantidad_antes: stockAntes,
          cantidad_despues: stockDespues,
          cantidad: delta,
          referencia: tipoAjuste === "intercambio" ? "Intercambio de stock" : `Ajuste de stock - ${motivoGlobal}`,
          descripcion: `${descBase}${qtyDesc}${row.comentario ? ` — ${row.comentario}` : ""}`,
          usuario,
          orden_id: ajuste.id,
        });
      }
    }

    logAudit({
      userName: usuario || "Admin",
      action: "CREATE",
      module: "stock",
      entityId: ajuste?.id,
      after: { tipo: tipoAjuste, motivo: motivoHeader, observacion, items: rows.length, total },
    });

    setDialogOpen(false);
    fetchData();
    setSaving(false);
  };

  const viewDetail = async (aj: Ajuste, autoAction: "print" | "pdf" | "anular" | null = null) => {
    setDetailAutoAction(autoAction);
    setDetailAjuste(aj);
    const { data } = await supabase.from("ajuste_stock_items").select("*").eq("ajuste_id", aj.id);
    const itemsWithProd = (data || []).map((d: any) => ({
      ...d,
      producto: productos.find((p) => p.id === d.producto_id),
    }));
    setDetailItems(itemsWithProd);
  };

  const openContextMenu = (e: React.MouseEvent, aj: Ajuste) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 220;
    const menuHeight = 240;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuWidth > vw - 8) x = vw - menuWidth - 8;
    if (y + menuHeight > vh - 8) y = vh - menuHeight - 8;
    if (y < 8) y = 8;
    setContextMenu({ x, y, ajuste: aj });
  };

  const handleAnular = async (aj: Ajuste, items: any[], motivoAnulacion: string) => {
    if (aj.anulado) {
      showAdminToast("Este ajuste ya está anulado", "error");
      return;
    }

    // Determinar el delta original que se aplicó cuando se creó el ajuste
    // (mismo signo que en handleSave). La anulación aplica el opuesto.
    const tipo = aj.motivo === "Intercambio" ? "intercambio" : null;

    let warnedNegative = false;
    for (const it of items) {
      const cantidad = Number(it.cantidad) || 0;
      if (cantidad <= 0) continue;

      // delta original que se aplicó al crear el ajuste:
      // - Intercambio: in => +cant, out => -cant
      // - Egreso: -cant
      // - Ingreso: +cant
      let originalDelta: number;
      if (tipo === "intercambio") {
        originalDelta = it.direccion === "in" ? cantidad : -cantidad;
      } else if (it.stock_despues > it.stock_antes) {
        originalDelta = cantidad;   // ingreso
      } else {
        originalDelta = -cantidad;  // egreso
      }
      const reverso = -originalDelta;

      const { data: stockResult } = await supabase.rpc("atomic_update_stock", {
        p_producto_id: it.producto_id,
        p_change: reverso,
        p_allow_negative: true,
      });
      const stockAntes = stockResult?.stock_antes ?? 0;
      const stockDespues = stockResult?.stock_despues ?? stockAntes + reverso;

      if (reverso < 0 && stockDespues < 0 && !warnedNegative) {
        warnedNegative = true;
        showAdminToast("Algún producto quedó con stock negativo tras la anulación", "info");
      }

      const prodNombre = it.producto?.nombre || it.producto_id;
      await supabase.from("stock_movimientos").insert({
        producto_id: it.producto_id,
        tipo: "ajuste_anulado",
        cantidad_antes: stockAntes,
        cantidad_despues: stockDespues,
        cantidad: reverso,
        referencia: `Anulación de ajuste ${aj.id.slice(0, 8).toUpperCase()}`,
        descripcion: `Anulación: ${aj.motivo} (${prodNombre})${motivoAnulacion ? ` — ${motivoAnulacion}` : ""}`,
        usuario: currentUserName,
        orden_id: aj.id,
      });
    }

    const { error: updErr } = await supabase
      .from("ajustes_stock")
      .update({
        anulado: true,
        anulado_at: new Date().toISOString(),
        anulado_por: currentUserName,
        anulado_motivo: motivoAnulacion || null,
      })
      .eq("id", aj.id);

    if (updErr) {
      showAdminToast(`Error al marcar como anulado: ${updErr.message}`, "error");
      return;
    }

    logAudit({
      userName: currentUserName,
      action: "CANCEL",
      module: "stock",
      entityId: aj.id,
      after: { motivo: aj.motivo, items: items.length, motivoAnulacion },
    });

    showAdminToast("Ajuste anulado y stock revertido", "success");
    setDetailAjuste(null);
    fetchData();
  };

  const filteredSearch = productos.filter(
    (p) => norm(p.nombre).includes(norm(productSearch)) || norm(p.codigo).includes(norm(productSearch)) || ((p as any).codigos_adicionales || []).some((c: string) => norm(c).includes(norm(productSearch)))
  );

  if (dialogOpen) {
    return (
      <div className="flex flex-col h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 border-b flex items-center justify-between shrink-0 bg-muted/20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDialogOpen(false)}
              className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              title="Volver"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10">
              <PackageSearch className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight">Nuevo ajuste de stock</h1>
              <p className="text-xs text-muted-foreground">Egresos, ingresos o intercambios de inventario</p>
            </div>
          </div>
        </div>

        {/* Form header fields */}
        <div className="px-4 sm:px-6 py-3 border-b shrink-0 bg-card">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Fecha</label>
              <DateInput value={fecha} onChange={setFecha} className="h-8 w-36 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Usuario</label>
              <Input value={usuario} onChange={(e) => setUsuario(e.target.value)} className="h-8 w-40 text-sm" placeholder="Usuario" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Tipo de ajuste</label>
              <Select value={tipoAjuste} onValueChange={(v) => {
                if (!v) return;
                const newTipo = v as "egreso" | "ingreso" | "intercambio";
                setTipoAjuste(newTipo);
                if (newTipo === "intercambio") {
                  setRows((prev) => prev.map((r) => ({ ...r, direccion: r.direccion || "out" })));
                  setAddDireccion("out");
                } else {
                  setRows((prev) => prev.map((r) => ({ ...r, direccion: undefined })));
                }
              }}>
                <SelectTrigger className="h-8 w-44 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="egreso">Egreso</SelectItem>
                  <SelectItem value="ingreso">Ingreso</SelectItem>
                  <SelectItem value="intercambio">Intercambio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tipoAjuste !== "intercambio" && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Motivo</label>
                <Select value={motivoGlobal} onValueChange={(v) => {
                  if (!v) return;
                  setMotivoGlobal(v);
                  if (v !== MOTIVOS_GLOBALES[0]) setRows((prev) => prev.map((r) => ({ ...r, motivo: v })));
                }}>
                  <SelectTrigger className="h-8 w-64 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_GLOBALES.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {tipoAjuste === "intercambio" && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Próximo item</label>
                <div className="flex gap-1 border rounded-md p-0.5 bg-background">
                  <button type="button" onClick={() => setAddDireccion("out")} className={`px-3 h-7 rounded text-xs font-medium transition ${addDireccion === "out" ? "bg-red-100 text-red-700" : "text-muted-foreground hover:bg-muted"}`}>Sale</button>
                  <button type="button" onClick={() => setAddDireccion("in")} className={`px-3 h-7 rounded text-xs font-medium transition ${addDireccion === "in" ? "bg-emerald-100 text-emerald-700" : "text-muted-foreground hover:bg-muted"}`}>Entra</button>
                </div>
              </div>
            )}
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => setSearchOpen(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Agregar producto <kbd className="ml-1 border rounded px-1 py-0.5 text-[10px] bg-background">F1</kbd>
            </Button>
          </div>
        </div>

        {/* Items table — scrollable body (desktop) */}
        <div className="flex-1 overflow-auto bg-muted/10 hidden lg:block">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-card backdrop-blur z-10 border-b">
              <tr>
                <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground w-40">Código</th>
                <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground">Producto</th>
                <th className="text-center py-2 px-3 font-medium text-xs text-muted-foreground w-20">Cajas</th>
                <th className="text-center py-2 px-3 font-medium text-xs text-muted-foreground w-20">Sueltas</th>
                <th className="text-center py-2 px-3 font-medium text-xs text-muted-foreground w-20">Total un.</th>
                <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground w-28">Costo Unit.</th>
                <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground w-24">Costo Caja</th>
                <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground w-28">Subtotal</th>
                {motivoGlobal === MOTIVOS_GLOBALES[0] && tipoAjuste !== "intercambio" && (
                  <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground w-40">Motivo</th>
                )}
                <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground">Comentario</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-20 text-center text-muted-foreground text-sm bg-card">
                    <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    Presioná <kbd className="border rounded px-1.5 py-0.5 text-xs bg-muted">F1</kbd> o el botón <strong>Agregar producto</strong> para empezar
                  </td>
                </tr>
              )}
              {rows.map((row, idx) => (
                <tr
                  key={row.producto_id + idx}
                  data-ajuste-row={idx}
                  onClick={() => setSelectedRowIdx(idx)}
                  className={`border-b cursor-pointer transition-colors ${
                    selectedRowIdx === idx ? "bg-blue-50 dark:bg-blue-950/20" :
                    row.direccion === "out" ? "bg-red-50/40 hover:bg-red-50" :
                    row.direccion === "in" ? "bg-emerald-50/40 hover:bg-emerald-50" :
                    "bg-card hover:bg-muted/30"
                  }`}
                >
                  <td className="py-1 px-3">
                    <div className="flex items-center gap-1.5">
                      {row.direccion === "out" && <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-semibold border-red-300 text-red-700 bg-red-50">SALE</Badge>}
                      {row.direccion === "in" && <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-semibold border-emerald-300 text-emerald-700 bg-emerald-50">ENTRA</Badge>}
                      <span className="font-mono text-xs text-muted-foreground">{row.codigo}</span>
                    </div>
                  </td>
                  <td className="py-1 px-3 font-medium text-sm">{row.nombre}</td>
                  <td className="py-1 px-3">
                    {(row.unidades_por_presentacion || 1) > 1 ? (
                      <Input
                        type="number"
                        min={0}
                        value={row.cajas ?? 0}
                        onChange={(e) => {
                          const newCajas = Math.max(0, Number(e.target.value));
                          setRows((prev) => prev.map((r, i) => {
                            if (i !== idx) return r;
                            const upp = r.unidades_por_presentacion || 1;
                            const sueltas = r.sueltas || 0;
                            const cantidad = newCajas * upp + sueltas;
                            return { ...r, cajas: newCajas, cantidad, subtotal: cantidad * r.costo };
                          }));
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 w-full text-center text-sm"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-1 px-3">
                    <Input
                      type="number"
                      min={0}
                      value={row.sueltas ?? 0}
                      onChange={(e) => {
                        const newSueltas = Math.max(0, Number(e.target.value));
                        setRows((prev) => prev.map((r, i) => {
                          if (i !== idx) return r;
                          const upp = r.unidades_por_presentacion || 1;
                          const cajas = r.cajas || 0;
                          const cantidad = cajas * upp + newSueltas;
                          return { ...r, sueltas: newSueltas, cantidad, subtotal: cantidad * r.costo };
                        }));
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-7 w-full text-center text-sm"
                    />
                  </td>
                  <td className="py-1 px-3 text-center text-sm font-medium tabular-nums">
                    {row.cantidad}
                    {(row.unidades_por_presentacion || 1) > 1 && (row.cajas || 0) > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        {row.cajas}×{row.unidades_por_presentacion}{(row.sueltas || 0) > 0 && `+${row.sueltas}`}
                      </div>
                    )}
                  </td>
                  <td className="py-1 px-3">
                    <MoneyInput value={row.costo} onValueChange={(v) => updateRow(idx, "costo", v)} min={0} className="h-7 w-full text-right text-sm" />
                  </td>
                  <td className="py-1 px-3 text-right text-sm tabular-nums text-muted-foreground">
                    {(row.unidades_por_presentacion || 1) > 1
                      ? formatCurrency(row.costo * (row.unidades_por_presentacion || 1))
                      : "—"}
                  </td>
                  <td className="py-1 px-3 text-right text-sm font-medium tabular-nums">{formatCurrency(row.subtotal)}</td>
                  {motivoGlobal === MOTIVOS_GLOBALES[0] && tipoAjuste !== "intercambio" && (
                    <td className="py-1 px-3">
                      <Select value={row.motivo || MOTIVOS_ITEM[0]} onValueChange={(v) => v && updateRow(idx, "motivo", v)}>
                        <SelectTrigger className="h-7 text-xs" onClick={(e) => e.stopPropagation()}><SelectValue placeholder="Motivo" /></SelectTrigger>
                        <SelectContent>
                          {MOTIVOS_ITEM.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </td>
                  )}
                  <td className="py-1 px-3">
                    <Input value={row.comentario} onChange={(e) => updateRow(idx, "comentario", e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Comentario..." className="h-7 text-sm" />
                  </td>
                  <td className="py-1 px-2">
                    <button onClick={(e) => { e.stopPropagation(); removeRow(idx); }} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Items list — mobile view (cards) */}
        <div className="flex-1 overflow-auto bg-muted/10 lg:hidden p-3 space-y-2">
          {rows.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm bg-card rounded-lg">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
              Tocá <strong>Agregar producto</strong> para empezar
            </div>
          )}
          {rows.map((row, idx) => {
            const upp = row.unidades_por_presentacion || 1;
            return (
              <div
                key={row.producto_id + idx}
                data-ajuste-row={idx}
                className={`rounded-lg border p-3 space-y-2 ${
                  row.direccion === "out" ? "border-red-200 bg-red-50/40" :
                  row.direccion === "in" ? "border-emerald-200 bg-emerald-50/40" :
                  "bg-card"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {row.direccion === "out" && <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-semibold border-red-300 text-red-700 bg-red-50">SALE</Badge>}
                      {row.direccion === "in" && <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-semibold border-emerald-300 text-emerald-700 bg-emerald-50">ENTRA</Badge>}
                      <span className="font-mono text-[10px] text-muted-foreground">{row.codigo}</span>
                    </div>
                    <p className="font-medium text-sm mt-0.5 break-words">{row.nombre}</p>
                  </div>
                  <button onClick={() => removeRow(idx)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {upp > 1 ? (
                    <div>
                      <label className="text-[10px] text-muted-foreground font-medium">Cajas</label>
                      <Input
                        type="number"
                        min={0}
                        value={row.cajas ?? 0}
                        onChange={(e) => {
                          const newCajas = Math.max(0, Number(e.target.value));
                          setRows((prev) => prev.map((r, i) => {
                            if (i !== idx) return r;
                            const cantidad = newCajas * upp + (r.sueltas || 0);
                            return { ...r, cajas: newCajas, cantidad, subtotal: cantidad * r.costo };
                          }));
                        }}
                        className="h-8 text-center text-sm"
                      />
                    </div>
                  ) : <div />}
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">Sueltas</label>
                    <Input
                      type="number"
                      min={0}
                      value={row.sueltas ?? 0}
                      onChange={(e) => {
                        const newSueltas = Math.max(0, Number(e.target.value));
                        setRows((prev) => prev.map((r, i) => {
                          if (i !== idx) return r;
                          const cantidad = (r.cajas || 0) * upp + newSueltas;
                          return { ...r, sueltas: newSueltas, cantidad, subtotal: cantidad * r.costo };
                        }));
                      }}
                      className="h-8 text-center text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">Total un.</label>
                    <div className="h-8 flex items-center justify-center border rounded-md bg-muted/30 text-sm font-semibold">
                      {row.cantidad}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">Costo unit.</label>
                    <MoneyInput value={row.costo} onValueChange={(v) => updateRow(idx, "costo", v)} min={0} className="h-8 text-right text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">Subtotal</label>
                    <div className="h-8 flex items-center justify-end px-2 border rounded-md bg-muted/30 text-sm font-semibold tabular-nums">
                      {formatCurrency(row.subtotal)}
                    </div>
                  </div>
                </div>
                {motivoGlobal === MOTIVOS_GLOBALES[0] && tipoAjuste !== "intercambio" && (
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">Motivo</label>
                    <Select value={row.motivo || MOTIVOS_ITEM[0]} onValueChange={(v) => v && updateRow(idx, "motivo", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MOTIVOS_ITEM.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Input
                  value={row.comentario}
                  onChange={(e) => updateRow(idx, "comentario", e.target.value)}
                  placeholder="Comentario..."
                  className="h-8 text-sm"
                />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t bg-card shrink-0">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground font-medium">
                Observación {tipoAjuste === "intercambio" && <span className="text-red-500">(obligatoria — describí la contraparte)</span>}
              </label>
              <textarea
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                rows={2}
                placeholder={tipoAjuste === "intercambio" ? "Ej: Canje con proveedor X, cliente que devolvió Y..." : "Observaciones..."}
                className="w-full border rounded-md px-2 py-1.5 text-sm bg-background resize-none outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="shrink-0 text-right space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">Total</span>
                <div className="border rounded-md px-3 py-1.5 bg-background text-base font-bold tabular-nums w-40 text-right">
                  {formatCurrency(total)}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button size="sm" onClick={handleSave} disabled={rows.length === 0 || saving} className="min-w-[100px]">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Product search (reused as dialog in new-view) */}
        <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Agregar producto {tipoAjuste === "intercambio" && <span className={`text-xs font-normal ${addDireccion === "out" ? "text-red-600" : "text-emerald-600"}`}>({addDireccion === "out" ? "SALE" : "ENTRA"})</span>}</DialogTitle></DialogHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={codigoInputRef}
                placeholder="Buscar por nombre o código..."
                value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setSearchHl(0); setSearchPresIdx(-1); }}
                onKeyDown={(e) => {
                  const results = filteredSearch.slice(0, 20);
                  const current = results[searchHl];
                  const currentPres = current ? (presMap[current.id] || []) : [];
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSearchPresIdx(-1);
                    setSearchHl((h) => { const next = Math.min(h + 1, results.length - 1); document.querySelector(`[data-saidx="${next}"]`)?.scrollIntoView({ block: "nearest" }); return next; });
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSearchPresIdx(-1);
                    setSearchHl((h) => { const next = Math.max(h - 1, 0); document.querySelector(`[data-saidx="${next}"]`)?.scrollIntoView({ block: "nearest" }); return next; });
                  } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    if (currentPres.length > 0) setSearchPresIdx((i) => Math.min(i + 1, currentPres.length - 1));
                  } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    setSearchPresIdx((i) => Math.max(i - 1, -1));
                  } else if (e.key === "Enter" && current) {
                    e.preventDefault();
                    if (searchPresIdx >= 0 && currentPres[searchPresIdx]) {
                      addProduct(current, currentPres[searchPresIdx]);
                    } else {
                      addProduct(current);
                    }
                    setSearchOpen(false); setProductSearch(""); setSearchPresIdx(-1);
                  }
                }}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredSearch.slice(0, 20).map((p, pIdx) => {
                const pres = presMap[p.id];
                const isHl = pIdx === searchHl;
                return (
                  <div key={p.id} data-saidx={pIdx} className={`rounded-xl border p-3 transition-colors ${isHl ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:border-primary/30 hover:bg-primary/5"}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                        {(p as any).imagen_url ? (<img src={(p as any).imagen_url} alt="" className="w-full h-full object-cover" />) : (<Package className="w-5 h-5 text-muted-foreground/30" />)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{p.nombre}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="font-mono">{p.codigo}</span>
                          <span>·</span>
                          <span>Stock: <strong className={p.stock <= 0 ? "text-red-500" : ""}>{p.stock}</strong></span>
                          <span>·</span>
                          <span>Costo: {formatCurrency(p.costo)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => { addProduct(p); setSearchOpen(false); setProductSearch(""); setSearchPresIdx(-1); }} className={`flex-1 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted transition ${isHl && searchPresIdx === -1 ? "ring-2 ring-primary border-primary" : ""}`}>+ Unidad</button>
                      {pres && pres.map((pr, prIdx) => (
                        <button key={pr.id} onClick={() => { addProduct(p, pr); setSearchOpen(false); setProductSearch(""); setSearchPresIdx(-1); }} className={`flex-1 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition ${isHl && searchPresIdx === prIdx ? "ring-2 ring-offset-1 ring-primary" : ""}`}>+ {pr.nombre} ({pr.cantidad} un.)</button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {filteredSearch.length === 0 && (<p className="text-center py-6 text-sm text-muted-foreground">Sin resultados</p>)}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <PackageSearch className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Ajustes de Stock</h1>
            <p className="text-sm text-muted-foreground">Registro de ajustes de inventario</p>
          </div>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" />Nuevo Ajuste
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Período</Label>
          <Select value={filterMode} onValueChange={(v) => setFilterMode((v ?? "day") as "day" | "month" | "range" | "all")}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Período" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="day">Día</SelectItem>
              <SelectItem value="month">Mensual</SelectItem>
              <SelectItem value="range">Entre fechas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {filterMode === "day" && (
          <DateInput value={filterDay} onChange={setFilterDay} className="w-40" />
        )}
        {filterMode === "month" && (
          <>
            <Select value={filterMonth} onValueChange={(v) => setFilterMonth(v ?? "1")}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Mes" /></SelectTrigger>
              <SelectContent>
                {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="w-20" />
          </>
        )}
        {filterMode === "range" && (
          <>
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <DateInput value={filterFrom} onChange={setFilterFrom} className="w-40" />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <DateInput value={filterTo} onChange={setFilterTo} className="w-40" />
            </div>
          </>
        )}
      </div>

      {/* History table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : ajustes.length === 0 ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay ajustes registrados</p>
        </div>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="border rounded-lg overflow-hidden overflow-x-auto hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground text-xs">
                  <th className="text-left py-2.5 px-4 font-medium">Fecha</th>
                  <th className="text-left py-2.5 px-4 font-medium">Usuario</th>
                  <th className="text-left py-2.5 px-4 font-medium">Motivo</th>
                  <th className="text-left py-2.5 px-4 font-medium">Observación</th>
                  <th className="text-right py-2.5 px-4 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ajustes.map((aj) => (
                  <tr key={aj.id} className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer ${aj.anulado ? "bg-red-50/40" : ""}`} onClick={() => viewDetail(aj)} onContextMenu={(e) => openContextMenu(e, aj)}>
                    <td className={`py-2.5 px-4 ${aj.anulado ? "line-through text-muted-foreground" : ""}`}>{formatDate(aj.fecha)}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">{aj.usuario || "—"}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={aj.anulado ? "line-through text-muted-foreground" : ""}>{aj.motivo}</Badge>
                        {aj.anulado && <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 text-[10px]">ANULADO</Badge>}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground text-xs">{aj.observacion || "—"}</td>
                    <td className="py-2.5 px-4 text-right">
                      <Badge variant="secondary" className="cursor-pointer">Ver detalle</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="lg:hidden space-y-2">
            {ajustes.map((aj) => {
              const isIntercambio = aj.motivo === "Intercambio";
              return (
                <button
                  key={aj.id}
                  onClick={() => viewDetail(aj)}
                  onContextMenu={(e) => openContextMenu(e, aj)}
                  className={`w-full text-left rounded-lg border p-3 hover:bg-muted/30 transition-colors ${aj.anulado ? "bg-red-50/40 border-red-200" : "bg-card"}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-sm font-semibold ${aj.anulado ? "line-through text-muted-foreground" : ""}`}>{formatDate(aj.fecha)}</span>
                    <div className="flex items-center gap-1.5">
                      {aj.anulado && <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 text-[10px]">ANULADO</Badge>}
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${aj.anulado ? "line-through text-muted-foreground" : isIntercambio ? "border-violet-300 text-violet-700 bg-violet-50" : ""}`}
                      >
                        {aj.motivo}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{aj.usuario || "—"}</span>
                  </div>
                  {aj.observacion && (
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{aj.observacion}</p>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Detail dialog — comprobante imprimible */}
      {detailAjuste && (
        <AjusteDetailDialog
          ajuste={detailAjuste}
          items={detailItems}
          onClose={() => { setDetailAjuste(null); setDetailAutoAction(null); }}
          onAnular={(motivo) => handleAnular(detailAjuste, detailItems, motivo)}
          autoAction={detailAutoAction}
          onAutoActionConsumed={() => setDetailAutoAction(null)}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-background border border-border rounded-xl shadow-lg py-1 min-w-[220px]"
          style={{ left: contextMenu.x, top: contextMenu.y, maxHeight: "calc(100vh - 16px)", overflowY: "auto" }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="px-3 py-2 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
              Ajuste {contextMenu.ajuste.id.slice(0, 8).toUpperCase()}
              {contextMenu.ajuste.anulado && <span className="ml-1.5 text-red-600">· ANULADO</span>}
            </p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {formatDate(contextMenu.ajuste.fecha)} · {contextMenu.ajuste.motivo}
            </p>
          </div>
          <div className="py-1">
            <button
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
              onClick={() => { const aj = contextMenu.ajuste; setContextMenu(null); viewDetail(aj); }}
            >
              <PackageSearch className="w-4 h-4 text-muted-foreground" /> Ver detalle
            </button>
            <button
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
              onClick={() => { const aj = contextMenu.ajuste; setContextMenu(null); viewDetail(aj, "print"); }}
            >
              <Printer className="w-4 h-4 text-muted-foreground" /> Imprimir comprobante
            </button>
            <button
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
              onClick={() => { const aj = contextMenu.ajuste; setContextMenu(null); viewDetail(aj, "pdf"); }}
            >
              <Download className="w-4 h-4 text-muted-foreground" /> Descargar PDF
            </button>
          </div>
          {!contextMenu.ajuste.anulado && (
            <div className="border-t py-1">
              <button
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left text-red-600"
                onClick={() => { const aj = contextMenu.ajuste; setContextMenu(null); viewDetail(aj, "anular"); }}
              >
                <Ban className="w-4 h-4" /> Anular ajuste
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
