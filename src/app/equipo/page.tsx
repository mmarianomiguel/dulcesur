"use client";

import { useState, useEffect } from "react";
import type { EquipoSession } from "@/types/equipo";
import { PinScreen } from "./components/pin-screen";
import { TableroArmado } from "./components/tablero-armado";

export default function EquipoPage() {
  const [session, setSession] = useState<EquipoSession | null>(null);
  const [ready, setReady] = useState(false);

  // Restore session from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("equipo_session");
      if (stored) setSession(JSON.parse(stored));
    } catch {}
    setReady(true);
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem("equipo_session");
    setSession(null);
  };

  if (!ready) return null; // Avoid flash while checking sessionStorage

  if (!session) {
    return <PinScreen onAuth={setSession} />;
  }

  return <TableroArmado session={session} onLogout={handleLogout} />;
}
