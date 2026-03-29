"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function TiendaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Tienda error:", error); }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
      <h2 className="text-xl font-semibold">Algo salió mal</h2>
      <p className="text-muted-foreground text-sm text-center">{error.message || "Error inesperado. Intentá de nuevo."}</p>
      <div className="flex gap-3">
        <button onClick={reset} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:opacity-90">
          Reintentar
        </button>
        <Link href="/" className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
