"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface NotasModalProps {
  clienteNombre: string;
  onConfirm: (notas: string) => Promise<void>;
  onCancel: () => void;
}

export function NotasModal({ clienteNombre, onConfirm, onCancel }: NotasModalProps) {
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm(notas);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <h3 className="font-bold text-gray-900 text-lg">
          Pedido de {clienteNombre}
        </h3>

        <div>
          <label className="text-sm font-medium text-gray-600 block mb-1.5">
            Observaciones del armado
          </label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej: falta 1 unidad, producto roto..."
            rows={3}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="text-xs text-gray-400 mt-1">Campo opcional</p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-medium text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-medium text-sm flex items-center justify-center gap-1.5"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirmar ✓
          </button>
        </div>
      </div>
    </div>
  );
}
