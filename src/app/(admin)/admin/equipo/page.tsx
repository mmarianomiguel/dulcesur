"use client";

import { useState } from "react";
import { Users, BarChart3 } from "lucide-react";
import { MiembrosTab } from "./components/miembros-tab";
import { SupervisionTab } from "./components/supervision-tab";

type Tab = "miembros" | "supervision";

export default function EquipoAdminPage() {
  const [tab, setTab] = useState<Tab>("supervision");

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="w-6 h-6" /> Equipo
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestión y supervisión del equipo de armado
        </p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        <button
          onClick={() => setTab("supervision")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "supervision"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Supervisión
        </button>
        <button
          onClick={() => setTab("miembros")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "miembros"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Users className="w-4 h-4" /> Miembros
        </button>
      </div>

      {tab === "supervision" ? <SupervisionTab /> : <MiembrosTab />}
    </div>
  );
}
