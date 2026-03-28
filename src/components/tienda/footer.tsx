"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Truck, Shield, CreditCard, Headphones, Instagram, Facebook, Phone, Mail,
  MapPin, ChevronRight, Clock, HelpCircle, FileText, ShoppingBag, UserPlus,
  Banknote,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface FooterConfig {
  descripcion: string;
  logo_url: string;
  instagram_url: string;
  facebook_url: string;
  whatsapp_url: string;
  direccion: string;
  telefono: string;
  email: string;
  badges: string[];
}

const DEFAULT_CONFIG: FooterConfig = {
  descripcion: "Tu tienda online con envío a todo el país.",
  logo_url: "",
  instagram_url: "",
  facebook_url: "",
  whatsapp_url: "",
  direccion: "",
  telefono: "",
  email: "",
  badges: ["Envío a domicilio", "Compra segura", "Múltiples medios de pago", "Atención personalizada"],
};

const badgeIcons: Record<string, typeof Truck> = {
  "Entrega en el día": Truck,
  "Envío gratis +$50.000": Shield,
  "Efectivo y transferencia": CreditCard,
  "Atención personalizada": Headphones,
};

const categoryLinks = [
  { label: "Todos los productos", href: "/productos" },
  { label: "Kiosco", href: "/productos?categoria=kiosco" },
  { label: "Almacen", href: "/productos?categoria=almacen" },
  { label: "Libreria", href: "/productos?categoria=libreria" },
];

const accountLinks = [
  { label: "Mis pedidos", href: "/cuenta/pedidos" },
  { label: "Mis direcciones", href: "/cuenta/direcciones" },
  { label: "Mi perfil", href: "/cuenta" },
];

const infoLinks = [
  { label: "Medios de pago", href: "/info#medios-de-pago", icon: Banknote },
  { label: "Envíos", href: "/info#envios", icon: Truck },
  { label: "Cómo comprar", href: "/info#como-comprar", icon: ShoppingBag },
  { label: "Cómo registrarse", href: "/info#como-registrarse", icon: UserPlus },
  { label: "Preguntas frecuentes", href: "/info#faq", icon: HelpCircle },
  { label: "Términos y condiciones", href: "/info#terminos", icon: FileText },
];

export default function TiendaFooter() {
  const [config, setConfig] = useState<FooterConfig>(DEFAULT_CONFIG);
  const [tiendaNombre, setTiendaNombre] = useState("DulceSur");

  useEffect(() => {
    supabase.from("tienda_config").select("nombre_tienda, logo_url, descripcion, footer_config").limit(1).single().then(({ data }) => {
      if (data) {
        setTiendaNombre(data.nombre_tienda || "DulceSur");
        const fc = (data as any).footer_config || {};
        setConfig({
          ...DEFAULT_CONFIG,
          ...fc,
          logo_url: fc.logo_url || data.logo_url || "",
          descripcion: fc.descripcion || data.descripcion || DEFAULT_CONFIG.descripcion,
        });
      }
    });
  }, []);

  return (
    <footer>
      <section className="bg-gray-900 text-gray-300">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12">
            {/* Brand */}
            <div className="lg:col-span-3">
              <img src={config.logo_url || "https://res.cloudinary.com/dss3lnovd/image/upload/v1774728837/dulcesur/Logotipo_DulceSur_2_rfwpdf.png"} alt={tiendaNombre} className="mb-4 h-10 w-auto" />
              <p className="mb-5 text-sm leading-relaxed text-gray-400">{config.descripcion}</p>
              <div className="flex items-center gap-3">
                {config.instagram_url && (
                  <a href={config.instagram_url} target="_blank" rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 text-gray-400 transition hover:border-primary hover:text-primary" aria-label="Instagram">
                    <Instagram className="h-4 w-4" />
                  </a>
                )}
                {config.facebook_url && (
                  <a href={config.facebook_url} target="_blank" rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 text-gray-400 transition hover:border-primary hover:text-primary" aria-label="Facebook">
                    <Facebook className="h-4 w-4" />
                  </a>
                )}
                {config.whatsapp_url && (
                  <a href={config.whatsapp_url} target="_blank" rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 text-gray-400 transition hover:border-primary hover:text-primary" aria-label="WhatsApp">
                    <Phone className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>

            {/* Categorías */}
            <div className="lg:col-span-2">
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Categorías</h4>
              <ul className="space-y-2.5">
                {categoryLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="group flex items-center gap-1 text-sm text-gray-400 transition hover:text-primary">
                      <ChevronRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />{link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Mi cuenta */}
            <div className="lg:col-span-2">
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Mi cuenta</h4>
              <ul className="space-y-2.5">
                {accountLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="group flex items-center gap-1 text-sm text-gray-400 transition hover:text-primary">
                      <ChevronRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />{link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Información */}
            <div className="lg:col-span-2">
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Información</h4>
              <ul className="space-y-2.5">
                {infoLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <li key={link.href}>
                      <Link href={link.href} className="group flex items-center gap-2 text-sm text-gray-400 transition hover:text-primary">
                        <Icon className="h-3.5 w-3.5 text-gray-500 transition group-hover:text-primary" />
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>


            {/* Contacto */}
            <div className="lg:col-span-3">
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Contacto</h4>
              <div className="space-y-4">
                {config.direccion && (
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-800">
                      <MapPin className="h-4 w-4 text-primary/80" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">Dirección</p>
                      <p className="text-sm text-gray-300">{config.direccion}</p>
                    </div>
                  </div>
                )}
                {config.telefono && (
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-800">
                      <Phone className="h-4 w-4 text-primary/80" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">Teléfono</p>
                      <a href={`tel:${config.telefono}`} className="text-sm text-gray-300 transition hover:text-primary">{config.telefono}</a>
                    </div>
                  </div>
                )}
                {config.email && (
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-800">
                      <Mail className="h-4 w-4 text-primary/80" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">Email</p>
                      <a href={`mailto:${config.email}`} className="text-sm text-gray-300 transition hover:text-primary">{config.email}</a>
                    </div>
                  </div>
                )}
                {config.whatsapp_url && (
                  <a href={config.whatsapp_url} target="_blank" rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:border-green-600 hover:text-green-400">
                    <Phone className="h-4 w-4" />
                    Escribinos por WhatsApp
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Trust badges */}
        {config.badges.length > 0 && (
          <div className="border-t border-gray-800">
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 sm:grid-cols-4">
              {config.badges.map((label) => {
                const Icon = badgeIcons[label] || Shield;
                return (
                  <div key={label} className="flex flex-col items-center gap-2 text-center">
                    <Icon className="h-6 w-6 text-primary/80" />
                    <span className="text-xs font-medium text-gray-400">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom bar */}
        <div className="border-t border-gray-800">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-gray-500 sm:flex-row">
            <p>&copy; {new Date().getFullYear()} {tiendaNombre} - Todos los derechos reservados</p>
            <p>Powered by <span className="font-medium text-gray-400">{tiendaNombre}</span></p>
          </div>
        </div>
      </section>
    </footer>
  );
}
