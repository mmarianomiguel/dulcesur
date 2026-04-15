"use client";

import { useState } from "react";
import { Loader2, Delete, AlertCircle } from "lucide-react";
import type { EquipoSession } from "@/types/equipo";

const LETRAS: Record<string, string> = {
  "1": "", "2": "ABC", "3": "DEF",
  "4": "GHI", "5": "JKL", "6": "MNO",
  "7": "PQRS", "8": "TUV", "9": "WXYZ", "0": "",
};

interface PinScreenProps {
  onAuth: (session: EquipoSession) => void;
}

export function PinScreen({ onAuth }: PinScreenProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const addDigit = (d: string) => {
    if (pin.length < 4) { setPin((p) => p + d); setError(null); }
  };
  const removeDigit = () => { setPin((p) => p.slice(0, -1)); setError(null); };

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

  return (
    <div className="min-h-screen flex flex-col bg-[#1e0a10]">
      {/* Top: logo + nombre + dots */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 pt-16 pb-6">
        {/* Logo */}
        <div className="w-24 h-24 rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center mb-6 overflow-hidden">
          <img
            src="https://res.cloudinary.com/dss3lnovd/image/upload/w_200,h_80,c_fit,q_auto,f_auto/v1775498382/dulcesur/xxzbm0omlakbcgob46ln.png"
            alt="Dulce Sur"
            width={80}
            height={48}
            className="object-contain"
          />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight mb-1">Dulce Sur</h1>
        <p className="text-white/50 text-sm mb-10">Sistema de equipo</p>

        {/* PIN dots */}
        <div className="flex gap-5 mb-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all duration-200 ${
                pin[i]
                  ? "bg-[#c94070] scale-110 shadow-[0_0_0_3px_rgba(201,64,112,0.3)]"
                  : "bg-white/20 scale-100"
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2.5 mt-2">
            <AlertCircle className="w-4 h-4 text-white shrink-0" />
            <span className="text-white text-sm font-medium">{error}</span>
          </div>
        )}
      </div>

      {/* Teclado — panel blanco redondeado */}
      <div className="bg-[#fdf5f6] rounded-t-[32px] px-5 pt-6 pb-10">
        <p className="text-center text-xs text-[#c4a0ae] font-medium mb-5 tracking-wide">
          Ingresá tu PIN de 4 dígitos
        </p>

        {/* Grid 3x3 */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => addDigit(d)}
              disabled={loading}
              className="flex flex-col items-center justify-center h-[72px] rounded-2xl bg-white border border-[#f0dde5] active:scale-95 active:bg-[#f7dde7] transition-all disabled:opacity-40"
            >
              <span className="text-2xl font-bold text-gray-800 leading-none">{d}</span>
              {LETRAS[d] && (
                <span className="text-[9px] tracking-[1.5px] text-[#c4a0ae] uppercase mt-1">{LETRAS[d]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Fila 0 */}
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={removeDigit}
            disabled={loading || pin.length === 0}
            className="flex items-center justify-center h-[72px] active:scale-95 transition-all disabled:opacity-30"
          >
            <Delete className="w-6 h-6 text-[#c4a0ae]" />
          </button>
          <button
            type="button"
            onClick={() => addDigit("0")}
            disabled={loading}
            className="flex items-center justify-center h-[72px] rounded-2xl bg-white border border-[#f0dde5] active:scale-95 active:bg-[#f7dde7] transition-all disabled:opacity-40"
          >
            <span className="text-2xl font-bold text-gray-800">0</span>
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading || pin.length !== 4}
            className={`flex items-center justify-center h-[72px] rounded-2xl transition-all active:scale-95 ${
              pin.length === 4
                ? "bg-[#c94070] shadow-lg shadow-[#c94070]/30"
                : "bg-[#f0dde5]"
            }`}
          >
            {loading
              ? <Loader2 className="w-6 h-6 text-white animate-spin" />
              : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                  stroke={pin.length === 4 ? "white" : "#e8c0ce"}
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )
            }
          </button>
        </div>
      </div>
    </div>
  );
}
