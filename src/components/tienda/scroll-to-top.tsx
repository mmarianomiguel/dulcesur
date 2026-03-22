"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export default function ScrollToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = () => setShow(window.scrollY > 400);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  if (!show) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-6 left-6 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-gray-800/80 text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-110 active:scale-95"
      aria-label="Volver arriba"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}
