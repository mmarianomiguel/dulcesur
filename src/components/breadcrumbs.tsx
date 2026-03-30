"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const ROUTE_NAMES: Record<string, string> = {
  admin: "Admin",
  ventas: "Ventas",
  listado: "Historial",
  "carga-manual": "Carga Manual",
  "hoja-ruta": "Hoja de Ruta",
  "nota-credito": "Nota de Crédito",
  "nota-debito": "Nota de Débito",
  remitos: "Remitos",
  "facturacion-lote": "Facturación en Lote",
  "entregas-pendientes": "Entregas Pendientes",
  "resumen-vendedor": "Resumen por Vendedor",
  percepciones: "Percepciones",
  anticipos: "Anticipos",
  clientes: "Clientes",
  productos: "Productos",
  "editar-precios": "Editar Precios",
  descuentos: "Descuentos",
  marcas: "Marcas",
  "lista-precios": "Lista de Precios",
  proveedores: "Proveedores",
  compras: "Compras",
  pedidos: "Pedidos",
  reposicion: "Reposición",
  caja: "Caja",
  stock: "Stock",
  ajustes: "Ajustes de Stock",
  autoconsumo: "Autoconsumo",
  reportes: "Reportes",
  "resumen-mensual": "Resumen Mensual",
  "ranking-clientes": "Ranking Clientes",
  vendedores: "Vendedores",
  auditoria: "Auditoría",
  configuracion: "Configuración",
  "white-label": "Apariencia",
  tienda: "Tienda Online",
  "pagina-inicio": "Página de Inicio",
  pagos: "Pagos",
  "usuarios-roles": "Usuarios y Roles",
  sistema: "Sistema",
  usuarios: "Usuarios",
  roles: "Roles",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  if (!pathname || pathname === "/admin") return null;

  const segments = pathname.split("/").filter(Boolean);
  // Remove "admin" prefix for display but keep for URLs
  if (segments[0] !== "admin") return null;

  const crumbs = segments.map((seg, i) => ({
    name: ROUTE_NAMES[seg] || seg,
    href: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));

  // Skip showing just "Admin" alone
  if (crumbs.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-4 px-6 pt-4" aria-label="Breadcrumb">
      <Link href="/admin" className="hover:text-foreground transition-colors">
        <Home className="w-3.5 h-3.5" />
      </Link>
      {crumbs.slice(1).map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <ChevronRight className="w-3 h-3" />
          {crumb.isLast ? (
            <span className="font-medium text-foreground">{crumb.name}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-foreground transition-colors">{crumb.name}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}
