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


export async function generateMetadata(): Promise<Metadata> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("tienda_config")
    .select("nombre_tienda, descripcion, meta_descripcion, favicon_url, og_image_url")
    .limit(1)
    .single();
  const tc: any = data || {};
  const nombre = tc.nombre_tienda || "Tienda Online";
  const desc = tc.meta_descripcion || tc.descripcion || `Tienda online de ${nombre}`;
  return {
    title: { default: nombre, template: `%s | ${nombre}` },
    description: desc,
    manifest: "/manifest-tienda.json",
    icons: tc.favicon_url ? { icon: tc.favicon_url, apple: tc.favicon_url } : undefined,
    openGraph: {
      title: nombre,
      description: desc,
      type: "website",
      siteName: nombre,
      ...(tc.og_image_url ? { images: [{ url: tc.og_image_url, width: 1200, height: 630 }] } : {}),
    },
  };
}

// Preconnect hints para recursos críticos — mejora LCP
export const viewport = {
  themeColor: "#ffffff",
};

export default async function TiendaLayout({ children }: { children: React.ReactNode }) {
  // SSR-fetch de config de tienda + empresa + categorías para evitar CLS
  // causado por el fetch cliente-side en navbar/footer.
  const sb = createServerSupabase();
  const [tcRes, empRes, catsRes, subsRes, prodMarcasRes] = await Promise.all([
    sb.from("tienda_config").select("nombre_tienda, logo_url, descripcion, footer_config, umbral_envio_gratis, horario_atencion_inicio, horario_atencion_fin, dias_atencion, tienda_activa, mensaje_mantenimiento").limit(1).single(),
    sb.from("empresa").select("nombre, telefono, white_label").limit(1).single(),
    sb.from("categorias").select("id, nombre, restringida").order("nombre"),
    sb.from("subcategorias").select("id, nombre, categoria_id"),
    sb.from("productos").select("categoria_id, marca_id, marcas(id, nombre)").eq("activo", true).eq("visibilidad", "visible").not("marca_id", "is", null).limit(2000),
  ]);

  const tc: any = tcRes.data || {};
  const emp: any = empRes.data || {};
  const cats: any[] = catsRes.data || [];

  // Pre-computa mapas para el mega-menú (antes se hacía client-side y bloqueaba el hover)
  const subcatsMap: Record<string, { id: string; nombre: string }[]> = {};
  (subsRes.data || []).forEach((s: any) => {
    if (!subcatsMap[s.categoria_id]) subcatsMap[s.categoria_id] = [];
    subcatsMap[s.categoria_id].push({ id: s.id, nombre: s.nombre });
  });

  const mTmp: Record<string, Map<string, string>> = {};
  (prodMarcasRes.data || []).forEach((p: any) => {
    if (!p.categoria_id || !p.marcas) return;
    if (!mTmp[p.categoria_id]) mTmp[p.categoria_id] = new Map();
    mTmp[p.categoria_id].set(p.marcas.id, p.marcas.nombre);
  });
  const marcasMap: Record<string, { id: string; nombre: string }[]> = {};
  for (const [catId, map] of Object.entries(mTmp)) {
    marcasMap[catId] = Array.from(map.entries()).slice(0, 8).map(([id, nombre]) => ({ id, nombre }));
  }

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
    subcatsMap,
    marcasMap,
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
    maps_url: fc.maps_url || "",
    telefono: fc.telefono || "",
    email: fc.email || "",
    badges: fc.badges || undefined,
  };

  // Si la tienda está apagada, mostramos un mensaje de mantenimiento en vez del catálogo.
  // Mantenemos navbar/footer para que el cliente vea branding/contacto.
  const tiendaActiva = tc?.tienda_activa !== false;
  const mensajeMantenimiento = (tc?.mensaje_mantenimiento as string | null) || "";

  return (
    <CartProvider>
      <>
        {/* Preconnect hints para recursos críticos */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://oepqhdjuujfdlpjjktbs.supabase.co" crossOrigin="anonymous" />
        <div className="flex min-h-screen flex-col bg-white">
          <AdminBanner />
          <TiendaNavbar initial={navbarInitial} />
          <main className="flex-1 min-h-[60vh]">
            {tiendaActiva ? children : (
              <section className="max-w-2xl mx-auto px-4 py-20 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-5">
                  <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-3">Estamos cerrados temporalmente</h1>
                {mensajeMantenimiento ? (
                  <p className="text-base text-gray-600 whitespace-pre-line max-w-lg mx-auto">{mensajeMantenimiento}</p>
                ) : (
                  <p className="text-base text-gray-600">Volvemos pronto. Disculpá las molestias.</p>
                )}
              </section>
            )}
          </main>
          <TiendaFooter initial={footerInitial} />
          <ToastContainer />
          <WhatsAppFloat />
          <ScrollToTop />
        </div>
      </>
    </CartProvider>
  );
}
