"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Building2, Receipt, Printer, CreditCard,
  Store, Package, FolderOpen, LayoutTemplate, FileText,
  Palette, Users, Puzzle, HardDrive,
  Settings, Menu,
} from "lucide-react";
import { useState } from "react";

const NAV_GROUPS = [
  {
    label: "Negocio",
    items: [
      { href: "/admin/configuracion", label: "Empresa", icon: Building2 },
      { href: "/admin/configuracion/facturacion", label: "Facturación", icon: Receipt },
      { href: "/admin/configuracion/pagos", label: "Pagos", icon: CreditCard },
      { href: "/admin/configuracion/impresion", label: "Impresión", icon: Printer },
    ],
  },
  {
    label: "Tienda Online",
    items: [
      { href: "/admin/configuracion/tienda", label: "General", icon: Store },
      { href: "/admin/configuracion/catalogo", label: "Catálogo", icon: FolderOpen },
      { href: "/admin/configuracion/pagina-inicio", label: "Página de Inicio", icon: LayoutTemplate },
      { href: "/admin/configuracion/pedidos", label: "Pedidos y Envíos", icon: Package },
      { href: "/admin/configuracion/footer", label: "Footer y Páginas", icon: FileText },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/configuracion/apariencia", label: "Apariencia", icon: Palette },
      { href: "/admin/configuracion/modulos", label: "Módulos", icon: Puzzle },
      { href: "/admin/configuracion/usuarios", label: "Usuarios y Roles", icon: Users },
      { href: "/admin/configuracion/backup", label: "Backup", icon: HardDrive },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin/configuracion") return pathname === "/admin/configuracion";
  return pathname.startsWith(href);
}

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-background px-4 sm:px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Configuración</h1>
          <p className="text-muted-foreground text-sm hidden sm:block">Administrá los ajustes de tu negocio, tienda online y sistema</p>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-lg hover:bg-muted"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Secondary sidebar */}
        <nav
          className={cn(
            "w-56 shrink-0 border-r bg-background overflow-y-auto py-4",
            "md:block",
            mobileOpen ? "block absolute z-40 inset-y-0 left-0 top-[73px] shadow-lg" : "hidden"
          )}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 px-4 py-2 mx-2 rounded-md text-sm transition-all",
                      active
                        ? "bg-accent text-foreground font-medium border-l-[3px] border-primary ml-0 pl-[13px]"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-l-[3px] border-transparent ml-0 pl-[13px]"
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", active && "text-primary")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
