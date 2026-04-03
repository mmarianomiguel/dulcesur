"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, Download, Loader2 } from "lucide-react";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
import { ReceiptPrintView } from "./receipt-print-view";
import type { ReceiptConfig, ReceiptSale } from "./receipt-print-view";

interface PrintPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  config: ReceiptConfig;
  sale: ReceiptSale;
  title?: string;
}

export function PrintPreviewDialog({
  open,
  onClose,
  config,
  sale,
  title,
}: PrintPreviewDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [savingPdf, setSavingPdf] = useState(false);

  const getHtmlContent = () => {
    if (!printRef.current) return "";
    return `<!DOCTYPE html><html><head><title>${sale.tipoComprobante} ${sale.numero}</title><style>@page{size:A4;margin:0}body{margin:0;padding:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${printRef.current.innerHTML}</body></html>`;
  };

  const handlePdf = async () => {
    if (!printRef.current) return;
    setSavingPdf(true);
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const { jsPDF } = await import("jspdf");
      // Clone node to render at full scale
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
      pdf.save(`${sale.tipoComprobante}-${sale.numero}.pdf`);
    } catch (err) {
      // Fallback: open print dialog
      console.error("PDF generation failed, falling back to print:", err);
      handlePrint();
    } finally {
      setSavingPdf(false);
    }
  };

  const handleWhatsApp = async () => {
    const phone = sale.clienteTelefono?.replace(/[^0-9]/g, "") || "";
    if (!phone) return;
    const fullPhone = phone.startsWith("54") ? phone : `54${phone}`;
    const items = sale.items?.map((i: any) => `• ${i.description} x${i.qty} = $${i.subtotal.toLocaleString("es-AR")}`).join("\n") || "";
    const msg = `*${sale.tipoComprobante} #${sale.numero}*\nCliente: ${sale.cliente}\n${items}\n\n*Total: $${sale.total.toLocaleString("es-AR")}*\nForma de pago: ${sale.formaPago}`;
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(
      `<!DOCTYPE html><html><head><title>${sale.tipoComprobante} ${sale.numero}</title><style>@page{size:A4;margin:0}body{margin:0;padding:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${content}</body></html>`
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-4 h-4" />
            {title || "Vista previa del recibo"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto border rounded-lg bg-white min-h-0">
          <div
            ref={printRef}
            style={{
              transform: "scale(0.52)",
              transformOrigin: "top left",
              width: "192%",
              pointerEvents: "none",
            }}
          >
            <ReceiptPrintView config={config} sale={sale} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="w-4 h-4 mr-1" /> Cancelar
          </Button>
          {sale.clienteTelefono && (
            <Button variant="outline" size="sm" onClick={handleWhatsApp} className="text-green-600 border-green-200 hover:bg-green-50">
              <WhatsAppIcon className="w-4 h-4 mr-1" /> WhatsApp
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handlePdf} disabled={savingPdf}>
            {savingPdf ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />} PDF
          </Button>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1" /> Imprimir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
