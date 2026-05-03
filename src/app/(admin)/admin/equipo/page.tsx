"use client";

import { useState } from "react";
import { Users, BarChart3, History } from "lucide-react";
import { MiembrosTab } from "./components/miembros-tab";
import { SupervisionTab } from "./components/supervision-tab";
import { HistorialTab } from "./components/historial-tab";

type Tab = "miembros" | "supervision" | "historial";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "supervision", label: "Supervisión", icon: BarChart3 },
  { id: "miembros", label: "Miembros", icon: Users },
  { id: "historial", label: "Historial", icon: History },
];

export default function EquipoAdminPage() {
  const [tab, setTab] = useState<Tab>("supervision");

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Equipo</h1>
          <p className="text-sm text-muted-foreground">Gestión y supervisión del equipo de armado</p>
        </div>
      </div>

      <div className="inline-flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              tab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "supervision" ? <SupervisionTab /> : tab === "historial" ? <HistorialTab /> : <MiembrosTab />}
    </div>
  );
}
