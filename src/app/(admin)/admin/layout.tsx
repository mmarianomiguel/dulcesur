"use client";

import { Sidebar } from "@/components/sidebar";
import AdminToastContainer from "@/components/admin-toast";
import { GlobalSearch } from "@/components/global-search";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu, Keyboard, X } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

      if (e.altKey && e.key === "v") { e.preventDefault(); router.push("/admin/ventas"); }
      else if (e.altKey && e.key === "d") { e.preventDefault(); router.push("/admin"); }
      else if (e.altKey && e.key === "c") { e.preventDefault(); router.push("/admin/caja"); }
      else if (e.key === "?" && !isInput) { e.preventDefault(); setShortcutsOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  const shortcuts = [
    { keys: ["Ctrl", "K"], desc: "Búsqueda global" },
    { keys: ["Alt", "V"], desc: "Nueva venta" },
    { keys: ["Alt", "D"], desc: "Dashboard" },
    { keys: ["Alt", "C"], desc: "Caja" },
    { keys: ["?"], desc: "Atajos de teclado" },
    { keys: ["Esc"], desc: "Cerrar diálogos" },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center h-12 px-3 bg-background border-b lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-1 rounded-lg hover:bg-accent transition-colors"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="ml-2 text-sm font-semibold">Panel de Administración</span>
        <button
          onClick={() => router.push("/admin/ventas")}
          className="ml-auto p-2 rounded-lg hover:bg-accent transition-colors text-primary"
          aria-label="Nueva venta"
        >
          <span className="text-xs font-semibold">+ Venta</span>
        </button>
      </div>

      {/* Sidebar */}
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      {/* Main content - add top padding on mobile for the header */}
      <main className="flex-1 overflow-y-auto pt-12 lg:pt-0">
        <Breadcrumbs />
        {children}
      </main>
      <AdminToastContainer />
      <GlobalSearch />

      {/* Shortcuts dialog */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShortcutsOpen(false)}>
          <div className="bg-background rounded-xl border shadow-lg p-6 w-80 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Atajos de teclado</h3>
              </div>
              <button onClick={() => setShortcutsOpen(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2">
              {shortcuts.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-muted-foreground">{s.desc}</span>
                  <div className="flex gap-1">
                    {s.keys.map((k) => (
                      <kbd key={k} className="px-1.5 py-0.5 text-xs font-mono bg-muted border rounded">{k}</kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
