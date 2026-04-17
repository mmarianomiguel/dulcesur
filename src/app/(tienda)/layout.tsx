import type { Metadata } from "next";
import Script from "next/script";
import TiendaNavbar from "@/components/tienda/navbar";
import TiendaFooter from "@/components/tienda/footer";
import { CartProvider } from "@/components/tienda/cart-drawer";
import AdminBanner from "@/components/tienda/admin-banner";
import ToastContainer from "@/components/tienda/toast";
import WhatsAppFloat from "@/components/tienda/whatsapp-float";
import ScrollToTop from "@/components/tienda/scroll-to-top";
import { createServerSupabase } from "@/lib/supabase-server";

// Revalidate layout data every 5 min so cambios en config/tienda aparecen rápido
export const revalidate = 300;


export const metadata: Metadata = {
  title: {
    default: "DulceSur - Tienda Online",
    template: "%s | DulceSur",
  },
  description:
    "Tienda online de DulceSur. Golosinas, galletitas, snacks y más al mejor precio.",
  manifest: "/manifest-tienda.json",
};

// Preconnect hints para recursos críticos — mejora LCP
export const viewport = {
  themeColor: "#ffffff",
};

export default async function TiendaLayout({ children }: { children: React.ReactNode }) {
  // SSR-fetch de config de tienda + empresa + categorías para evitar CLS
  // causado por el fetch cliente-side en navbar/footer.
  const sb = createServerSupabase();
  const [tcRes, empRes, catsRes] = await Promise.all([
    sb.from("tienda_config").select("nombre_tienda, logo_url, descripcion, footer_config, umbral_envio_gratis, horario_atencion_inicio, horario_atencion_fin, dias_atencion").limit(1).single(),
    sb.from("empresa").select("nombre, telefono, white_label").limit(1).single(),
    sb.from("categorias").select("id, nombre, restringida").order("nombre"),
  ]);

  const tc: any = tcRes.data || {};
  const emp: any = empRes.data || {};
  const cats: any[] = catsRes.data || [];

  const wlLogo = emp?.white_label?.logo_url as string | undefined;
  const rawLogoUrl = tc?.logo_url || wlLogo || "";
  const optimizedLogo = rawLogoUrl && rawLogoUrl.includes("cloudinary.com")
    ? rawLogoUrl.replace("/upload/", "/upload/w_200,h_80,c_fit,q_auto,f_auto/")
    : rawLogoUrl;

  const navbarInitial = {
    logoSrc: optimizedLogo,
    nombre: emp?.nombre || tc?.nombre_tienda || "Tienda",
    telefono: emp?.telefono || "",
    umbral_envio_gratis: tc?.umbral_envio_gratis || 0,
    horario_atencion_inicio: tc?.horario_atencion_inicio || "",
    horario_atencion_fin: tc?.horario_atencion_fin || "",
    dias_atencion: tc?.dias_atencion || [],
    categorias: cats,
  };

  const fc = tc?.footer_config || {};
  const footerInitial = {
    tiendaNombre: tc?.nombre_tienda || "DulceSur",
    logo_url: optimizedLogo,
    descripcion: fc.descripcion || tc?.descripcion || "",
    instagram_url: fc.instagram_url || "",
    facebook_url: fc.facebook_url || "",
    whatsapp_url: fc.whatsapp_url || "",
    direccion: fc.direccion || "",
    telefono: fc.telefono || "",
    email: fc.email || "",
    badges: fc.badges || undefined,
  };

  return (
    <CartProvider>
      <>
        {/* Preconnect hints para recursos críticos */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://oepqhdjuujfdlpjjktbs.supabase.co" crossOrigin="anonymous" />
        <div className="flex min-h-screen flex-col bg-white">
          <AdminBanner />
          <TiendaNavbar initial={navbarInitial} />
          <main className="flex-1 min-h-[60vh]">{children}</main>
          <TiendaFooter initial={footerInitial} />
          <ToastContainer />
          <WhatsAppFloat />
          <ScrollToTop />
        </div>
      </>
    </CartProvider>
  );
}
