"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <p className="text-8xl font-bold text-gray-200">404</p>
        <h1 className="mt-4 text-2xl font-bold text-gray-800">Página no encontrada</h1>
        <p className="mt-2 text-gray-500">La página que buscás no existe o fue movida.</p>
        <div className="mt-6 flex gap-3 justify-center">
          <Link href="/" className="px-5 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700 transition">
            Ir al inicio
          </Link>
          <Link href="/admin" className="px-5 py-2.5 rounded-xl bg-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-300 transition">
            Panel admin
          </Link>
        </div>
      </div>
    </div>
  );
}
