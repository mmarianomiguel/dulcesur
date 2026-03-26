"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-800">Algo salió mal</h1>
        <p className="mt-2 text-gray-500">Ocurrió un error inesperado. Intentá de nuevo.</p>
        <div className="mt-6 flex gap-3 justify-center">
          <button onClick={reset} className="px-5 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700 transition">
            Reintentar
          </button>
          <button onClick={() => window.location.href = "/"} className="px-5 py-2.5 rounded-xl bg-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-300 transition">
            Ir al inicio
          </button>
        </div>
      </div>
    </div>
  );
}
