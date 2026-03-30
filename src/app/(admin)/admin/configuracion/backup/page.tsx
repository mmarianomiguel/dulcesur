"use client";

import { useState } from "react";
import { showAdminToast } from "@/components/admin-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HardDrive, Download, Upload } from "lucide-react";

export default function BackupPage() {
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
          <HardDrive className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Backup</h1>
          <p className="text-sm text-muted-foreground">
            Exportá e importá los datos del sistema
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exportar Backup</CardTitle>
            <CardDescription>Descarga un archivo JSON con todos los datos del sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={async () => {
                try {
                  showAdminToast("Generando backup...");
                  const res = await fetch("/api/backup");
                  if (!res.ok) throw new Error("Error al generar backup");
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `backup_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  showAdminToast("Backup descargado correctamente");
                } catch {
                  showAdminToast("Error al generar el backup", "error");
                }
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Descargar Backup
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Restaurar Backup</CardTitle>
            <CardDescription>Restaura los datos desde un archivo JSON previamente exportado. Esto reemplazará todos los datos actuales.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              id="backup-restore-input"
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const inputEl = e.target;
                setConfirmDialog({
                  open: true,
                  title: "Restaurar backup",
                  message: "Esto reemplazará TODOS los datos actuales. ¿Estás seguro?",
                  onConfirm: async () => {
                    try {
                      showAdminToast("Restaurando backup...");
                      const text = await file.text();
                      const json = JSON.parse(text);
                      const res = await fetch("/api/backup", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(json),
                      });
                      const result = await res.json();
                      if (!res.ok) throw new Error(result.error);
                      showAdminToast(`Backup restaurado: ${result.success_count} tablas exitosas`);
                    } catch {
                      showAdminToast("Error al restaurar el backup", "error");
                    }
                    inputEl.value = "";
                  },
                });
              }}
            />
            <Button
              variant="outline"
              onClick={() => document.getElementById("backup-restore-input")?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              Seleccionar archivo JSON
            </Button>
            <p className="text-xs text-destructive">
              Advertencia: La restauración eliminará los datos actuales y los reemplazará con los del backup.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(o) => { if (!o) { setConfirmDialog(prev => ({ ...prev, open: false })); const el = document.getElementById("backup-restore-input") as HTMLInputElement; if (el) el.value = ""; } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{confirmDialog.title}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{confirmDialog.message}</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => { setConfirmDialog(prev => ({ ...prev, open: false })); const el = document.getElementById("backup-restore-input") as HTMLInputElement; if (el) el.value = ""; }}>Cancelar</Button>
            <Button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({ ...prev, open: false })); }}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
