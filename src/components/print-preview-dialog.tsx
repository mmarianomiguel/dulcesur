"use client";

import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
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
          <Button size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1" /> Imprimir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
