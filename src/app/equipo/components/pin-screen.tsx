"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { EquipoSession } from "@/types/equipo";

interface PinScreenProps {
  onAuth: (session: EquipoSession) => void;
}

export function PinScreen({ onAuth }: PinScreenProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const addDigit = (d: string) => {
    if (pin.length < 4) {
      setPin((p) => p + d);
      setError(null);
    }
  };

  const removeDigit = () => {
    setPin((p) => p.slice(0, -1));
    setError(null);
  };

  const submit = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/equipo/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || "PIN incorrecto");
        setPin("");
        setLoading(false);
        return;
      }
      const data: EquipoSession = await res.json();
      sessionStorage.setItem("equipo_session", JSON.stringify(data));
      onAuth(data);
    } catch {
      setError("Error de conexión");
      setPin("");
    }
    setLoading(false);
  };

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dulce Sur</h1>
        <p className="text-gray-500 mt-1">Sistema de Equipo</p>
      </div>

      {/* PIN display */}
      <div className="flex gap-3 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-14 h-14 rounded-xl border-2 border-gray-300 flex items-center justify-center text-2xl font-bold"
          >
            {pin[i] ? "●" : ""}
          </div>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-red-500 text-sm font-medium mb-4">{error}</p>
      )}

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {digits.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => addDigit(d)}
            disabled={loading}
            className="w-[72px] h-[72px] rounded-2xl bg-white border border-gray-200 text-xl font-semibold text-gray-800 active:bg-gray-100 disabled:opacity-50 shadow-sm"
          >
            {d}
          </button>
        ))}
      </div>
      <div className="flex justify-center mb-6">
        <button
          type="button"
          onClick={() => addDigit("0")}
          disabled={loading}
          className="w-[72px] h-[72px] rounded-2xl bg-white border border-gray-200 text-xl font-semibold text-gray-800 active:bg-gray-100 disabled:opacity-50 shadow-sm"
        >
          0
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-3 w-full max-w-[240px]">
        <button
          type="button"
          onClick={removeDigit}
          disabled={loading || pin.length === 0}
          className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-medium text-sm disabled:opacity-30"
        >
          ← Borrar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={loading || pin.length !== 4}
          className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Confirmar
        </button>
      </div>
    </div>
  );
}
