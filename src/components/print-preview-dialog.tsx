"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, Download, Send, Loader2 } from "lucide-react";
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
              <Send className="w-4 h-4 mr-1" /> WhatsApp
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
