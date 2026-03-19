"use client";

import { useState, useEffect, FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Truck, Shield, CreditCard, Headphones, Instagram, Facebook, Phone, Mail,
  MapPin, Send, ChevronRight,
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
  mostrar_newsletter: boolean;
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
  mostrar_newsletter: true,
  badges: ["Envío a domicilio", "Compra segura", "Múltiples medios de pago", "Atención personalizada"],
};

const badgeIcons: Record<string, typeof Truck> = {
  "Envío a domicilio": Truck,
  "Compra segura": Shield,
  "Múltiples medios de pago": CreditCard,
  "Atención personalizada": Headphones,
};

const categoryLinks = [
  { label: "Todos los productos", href: "/productos" },
  { label: "Ofertas", href: "/productos?categoria=ofertas" },
  { label: "Nuevos ingresos", href: "/productos?categoria=nuevos" },
  { label: "Más vendidos", href: "/productos?categoria=mas-vendidos" },
];

const accountLinks = [
  { label: "Mis pedidos", href: "/cuenta/pedidos" },
  { label: "Mis direcciones", href: "/cuenta/direcciones" },
  { label: "Mi perfil", href: "/cuenta" },
];

const infoLinks = [
  { label: "Medios de pago", href: "/info/medios-de-pago" },
  { label: "Envíos", href: "/info/envios" },
  { label: "Cómo comprar", href: "/info/como-comprar" },
  { label: "Cómo registrarse", href: "/info/como-registrarse" },
  { label: "Preguntas frecuentes", href: "/info/faq" },
  { label: "Términos y condiciones", href: "/info/terminos" },
  { label: "Contacto", href: "/info/contacto" },
];

export default function TiendaFooter() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
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

  const handleNewsletter = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setEmail("");
      setTimeout(() => setSubscribed(false), 4000);
    }
  };

  return (
    <footer>
      {config.mostrar_newsletter && (
        <section className="bg-pink-600 text-white">
          <div className="mx-auto max-w-7xl px-4 py-10">
            <div className="flex flex-col items-center gap-4 text-center md:flex-row md:justify-between md:text-left">
              <div>
                <h3 className="text-xl font-bold">Suscribite a nuestro newsletter</h3>
                <p className="mt-1 text-sm text-pink-100">Recibí ofertas exclusivas y novedades</p>
              </div>
              <form onSubmit={handleNewsletter} className="flex w-full max-w-md items-center gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Tu email" required
                    className="h-11 w-full rounded-full pl-10 pr-4 text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-white/40" />
                </div>
                <button type="submit" className="flex h-11 items-center gap-1.5 rounded-full bg-white px-6 text-sm font-semibold text-pink-600 transition hover:bg-pink-50">
                  <Send className="h-4 w-4" />Suscribirse
                </button>
              </form>
              {subscribed && <p className="text-sm font-medium text-pink-100">¡Gracias por suscribirte!</p>}
            </div>
          </div>
        </section>
      )}

      <section className="bg-gray-900 text-gray-300">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {/* Brand */}
            <div>
              {config.logo_url ? (
                <Image src={config.logo_url} alt={tiendaNombre} width={130} height={44} className="mb-4 h-10 w-auto brightness-0 invert" />
              ) : (
                <h3 className="mb-4 text-lg font-bold text-white">{tiendaNombre}</h3>
              )}
              <p className="mb-5 text-sm leading-relaxed text-gray-400">{config.descripcion}</p>
              <div className="flex items-center gap-3">
                {config.instagram_url && (
                  <a href={config.instagram_url} target="_blank" rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 text-gray-400 transition hover:border-pink-500 hover:text-pink-400" aria-label="Instagram">
                    <Instagram className="h-4 w-4" />
                  </a>
                )}
                {config.facebook_url && (
                  <a href={config.facebook_url} target="_blank" rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 text-gray-400 transition hover:border-pink-500 hover:text-pink-400" aria-label="Facebook">
                    <Facebook className="h-4 w-4" />
                  </a>
                )}
                {config.whatsapp_url && (
                  <a href={config.whatsapp_url} target="_blank" rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 text-gray-400 transition hover:border-pink-500 hover:text-pink-400" aria-label="WhatsApp">
                    <Phone className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>

            {/* Categorías */}
            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Categorías</h4>
              <ul className="space-y-2.5">
                {categoryLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="group flex items-center gap-1 text-sm text-gray-400 transition hover:text-pink-400">
                      <ChevronRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />{link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Mi cuenta */}
            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Mi cuenta</h4>
              <ul className="space-y-2.5">
                {accountLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="group flex items-center gap-1 text-sm text-gray-400 transition hover:text-pink-400">
                      <ChevronRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />{link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Información */}
            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Información</h4>
              <ul className="space-y-2.5">
                {infoLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="group flex items-center gap-1 text-sm text-gray-400 transition hover:text-pink-400">
                      <ChevronRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />{link.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-6 space-y-2 text-sm text-gray-500">
                {config.direccion && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />{config.direccion}</p>}
                {config.telefono && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{config.telefono}</p>}
                {config.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" />{config.email}</p>}
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
                    <Icon className="h-6 w-6 text-pink-500" />
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
            <p>Powered by <span className="font-medium text-gray-400">Dulcesur</span></p>
          </div>
        </div>
      </section>
    </footer>
  );
}
