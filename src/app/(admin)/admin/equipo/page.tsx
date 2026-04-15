"use client";

import { useState } from "react";
import { Users, BarChart3, History } from "lucide-react";
import { MiembrosTab } from "./components/miembros-tab";
import { SupervisionTab } from "./components/supervision-tab";
import { HistorialTab } from "./components/historial-tab";

type Tab = "miembros" | "supervision" | "historial";

export default function EquipoAdminPage() {
  const [tab, setTab] = useState<Tab>("supervision");

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto bg-[#F4F4F6]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#12131A] flex items-center gap-2">
          <Users className="w-6 h-6" /> Equipo
        </h1>
        <p className="text-sm text-[#6B7080] mt-1">
          Gestión y supervisión del equipo de armado
        </p>
      </div>

      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-6 w-fit">
        <button
          onClick={() => setTab("supervision")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "supervision"
              ? "bg-[#FFE0EC] text-[#99003D]"
              : "text-[#6B7080] hover:text-[#12131A]"
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Supervisión
        </button>
        <button
          onClick={() => setTab("miembros")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "miembros"
              ? "bg-[#FFE0EC] text-[#99003D]"
              : "text-[#6B7080] hover:text-[#12131A]"
          }`}
        >
          <Users className="w-4 h-4" /> Miembros
        </button>
        <button
          onClick={() => setTab("historial")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "historial"
              ? "bg-[#FFE0EC] text-[#99003D]"
              : "text-[#6B7080] hover:text-[#12131A]"
          }`}
        >
          <History className="w-4 h-4" /> Historial
        </button>
      </div>

      {tab === "supervision" ? <SupervisionTab /> : tab === "historial" ? <HistorialTab /> : <MiembrosTab />}
    </div>
  );
}
