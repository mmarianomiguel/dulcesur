"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  Truck,
  Wallet,
  Receipt,
  Settings,
  Store,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  Building2,
  List,
  Banknote,
  ClipboardList,
  BarChart3,
  PackageMinus,
  X,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { useWhiteLabel } from "@/hooks/use-white-label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

import type { LucideIcon } from "lucide-react";

interface NavChild {
  name: string;
  href: string;
  icon?: LucideIcon;
}

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  children?: NavChild[];
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  {
    name: "Ventas",
    href: "/admin/ventas",
    icon: ShoppingCart,
    children: [
      { name: "Punto de venta", href: "/admin/ventas" },
      { name: "Pedidos Online", href: "/admin/ventas/pedidos-online" },
      { name: "Historial", href: "/admin/ventas/listado" },
      { name: "Entregas y Ruta", href: "/admin/ventas/hoja-ruta" },
      { name: "Nota de Crédito", href: "/admin/ventas/nota-credito" },
      { name: "Nota de Débito", href: "/admin/ventas/nota-debito" },
      { name: "Anticipos", href: "/admin/ventas/anticipos" },
    ],
  },
  {
    name: "Clientes",
    href: "/admin/clientes",
    icon: Users,
    children: [
      { name: "Listado", href: "/admin/clientes", icon: List },
    ],
  },
  {
    name: "Productos",
    href: "/admin/productos",
    icon: Package,
    children: [
      { name: "Listado", href: "/admin/productos" },
      { name: "Editar Precios", href: "/admin/productos/editar-precios" },
      { name: "Descuentos", href: "/admin/productos/descuentos" },
      { name: "Marcas", href: "/admin/productos/marcas" },
      { name: "Lista de Precios (PDF)", href: "/admin/productos/lista-precios" },
    ],
  },
  { name: "Proveedores", href: "/admin/proveedores", icon: Truck },
  {
    name: "Compras",
    href: "/admin/compras",
    icon: Receipt,
    children: [
      { name: "Registrar", href: "/admin/compras" },
      { name: "Pedidos", href: "/admin/compras/pedidos", icon: ClipboardList },
      { name: "Reposicion", href: "/admin/compras/reposicion" },
    ],
  },
  { name: "Caja", href: "/admin/caja", icon: Wallet },
  {
    name: "Stock",
    href: "/admin/stock/ajustes",
    icon: PackageMinus,
    children: [
      { name: "Ajustes de Stock", href: "/admin/stock/ajustes" },
    ],
  },
  {
    name: "Reportes",
    href: "/admin/reportes",
    icon: BarChart3,
    children: [
      { name: "General", href: "/admin/reportes" },
      { name: "Resumen Mensual", href: "/admin/reportes/resumen-mensual" },
      { name: "Resumen por Vendedor", href: "/admin/ventas/resumen-vendedor" },
      { name: "Percepciones", href: "/admin/ventas/percepciones" },
    ],
  },
  { name: "Tienda Online", href: "/", icon: Store },
  {
    name: "Configuración",
    href: "/admin/configuracion",
    icon: Settings,
    children: [
      { name: "General", href: "/admin/configuracion" },
      { name: "Personalización", href: "/admin/configuracion/white-label" },
      { name: "Tienda Online", href: "/admin/configuracion/tienda" },
      { name: "Página de Inicio", href: "/admin/configuracion/pagina-inicio" },
      { name: "Footer", href: "/admin/configuracion/footer" },
      { name: "Usuarios", href: "/admin/usuarios" },
      { name: "Roles", href: "/admin/roles" },
    ],
  },
];

const ALWAYS_VISIBLE = ["Dashboard", "Configuración"];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { config: wl } = useWhiteLabel();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [modulosConfig, setModulosConfig] = useState<Record<string, boolean> | null>(null);
  const [permisosMap, setPermisosMap] = useState<Record<string, boolean> | null>(null);
  const permsFetched = useRef(false);

  // Close mobile sidebar on route change
  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      onMobileClose?.();
    }
  }, [pathname, onMobileClose]);

  // Fetch permissions from supabase based on current auth user
  useEffect(() => {
    if (permsFetched.current) return;
    permsFetched.current = true;

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: usuario } = await supabase
          .from("usuarios")
          .select("rol_id, es_admin")
          .eq("auth_id", user.id)
          .single();

        if (!usuario) return;

        // Admins see everything
        if (usuario.es_admin) {
          setPermisosMap(null); // null = show all
          return;
        }

        if (!usuario.rol_id) {
          setPermisosMap({}); // no role = show nothing (except always visible)
          return;
        }

        const { data: permisos } = await supabase
          .from("permisos")
          .select("modulo, submodulo, habilitado")
          .eq("rol_id", usuario.rol_id);

        const pMap: Record<string, boolean> = {};
        (permisos || []).forEach((p: { modulo: string; submodulo: string; habilitado: boolean }) => {
          pMap[`${p.modulo}::${p.submodulo}`] = p.habilitado;
        });
        setPermisosMap(pMap);
      } catch {
        // Auth not available, fall through to localStorage
      }
    })();
  }, []);

  const loadModulos = useCallback(() => {
    try {
      const stored = localStorage.getItem("modulos_habilitados");
      if (stored) setModulosConfig(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    loadModulos();
    const handler = () => loadModulos();
    window.addEventListener("modulos_updated", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("modulos_updated", handler);
      window.removeEventListener("storage", handler);
    };
  }, [loadModulos]);

  // Map nav child names to permission submodule names
  const childPermKey = (parentName: string, childName: string) =>
    `${parentName}::${childName}`;

  const filteredNavigation = navigation
    .filter((item) => {
      if (ALWAYS_VISIBLE.includes(item.name)) return true;

      // If permissions loaded from DB, use them
      if (permisosMap !== null) {
        if (!item.children?.length) {
          // Module without submodules: check modulo::""
          return permisosMap[`${item.name}::`] === true;
        }
        // Module with children: visible if at least one child is enabled
        return item.children.some(
          (c) => permisosMap[childPermKey(item.name, c.name)] === true
        );
      }

      // Fallback to localStorage
      if (!modulosConfig) return true;
      return modulosConfig[item.name] !== false;
    })
    .map((item) => {
      // Filter children based on permissions
      if (permisosMap !== null && item.children?.length) {
        return {
          ...item,
          children: item.children.filter(
            (c) => permisosMap[childPermKey(item.name, c.name)] === true
          ),
        };
      }
      return item;
    });

  const isNavActive = (item: NavItem) =>
    item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);

  const isChildActive = (child: NavChild) => pathname === child.href;

  const isAnyChildActive = (item: NavItem) =>
    item.children?.some((child) => isChildActive(child)) ?? false;

  const isSectionExpanded = (item: NavItem) =>
    expandedSections.includes(item.name) ||
    isNavActive(item) ||
    isAnyChildActive(item);

  const toggleSection = (name: string) => {
    setExpandedSections((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  return (
    <TooltipProvider>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={cn(
          "flex flex-col h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 ease-in-out",
          collapsed ? "w-[72px]" : "w-[260px]",
          // Mobile: fixed overlay sidebar, completely hidden when closed
          "fixed z-50 lg:relative lg:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          !mobileOpen && "max-lg:hidden"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 shrink-0 relative">
          {wl.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wl.logo_url} alt="Logo" className="w-9 h-9 rounded-lg object-contain" />
          ) : (
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold text-lg">
              {wl.logo_initial || "C"}
            </div>
          )}
          {!collapsed && (
            <div className="flex flex-col flex-1">
              <span className="text-base font-semibold tracking-tight text-sidebar-foreground">
                {wl.system_name || "Dulcesur"}
              </span>
              <span className="text-[11px] text-sidebar-foreground/50">
                {wl.system_subtitle || "Gestión Comercial"}
              </span>
            </div>
          )}
          {/* Mobile close button */}
          <button
            onClick={onMobileClose}
            className="lg:hidden p-1.5 rounded-lg hover:bg-sidebar-accent/50 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {filteredNavigation.map((item) => {
            const isActive = isNavActive(item);
            const hasChildren = !!item.children?.length;
            const expanded = hasChildren && !collapsed && isSectionExpanded(item);

            const parentEl = hasChildren && !collapsed ? (
              <button
                key={item.name}
                onClick={() => toggleSection(item.name)}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="flex-1 text-left">{item.name}</span>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 shrink-0 transition-transform duration-200",
                    expanded ? "rotate-0" : "-rotate-90"
                  )}
                />
              </button>
            ) : (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      <item.icon className="w-5 h-5 shrink-0" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.name}</TooltipContent>
                </Tooltip>
              );
            }

            return (
              <div key={item.name}>
                {parentEl}
                {expanded && item.children && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
                    {item.children.map((child) => {
                      const childActive = isChildActive(child);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150",
                            childActive
                              ? "text-sidebar-primary bg-sidebar-accent/60"
                              : "text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
                          )}
                        >
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0",
                              childActive
                                ? "bg-sidebar-primary"
                                : "bg-sidebar-foreground/30"
                            )}
                          />
                          <span>{child.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <Separator className="bg-sidebar-border" />

        {/* User & Collapse */}
        <div className="px-3 py-3 space-y-2">
          {!collapsed && (
            <div className="flex items-center gap-3 px-3 py-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-xs">
                  MM
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">Mariano Miguel</p>
                <p className="text-xs text-sidebar-foreground/50 truncate flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> DulceSur
                </p>
              </div>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push("/login");
                  router.refresh();
                }}
                title="Cerrar sesión"
                className="text-sidebar-foreground/50 hover:text-red-400 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center w-full py-2 rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
