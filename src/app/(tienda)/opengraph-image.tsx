import { ImageResponse } from "next/og";
import { createServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const revalidate = 300;
export const alt = "Tienda Online";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Optimiza un logo de Cloudinary para que no llegue gigante.
function optimizeLogo(url: string): string {
  if (!url || !url.includes("res.cloudinary.com")) return url;
  if (url.includes("/upload/w_") || url.includes("/upload/q_")) return url;
  return url.replace("/upload/", "/upload/w_400,c_fit,q_auto:good,f_png/");
}

export default async function Image() {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("tienda_config")
    .select("nombre_tienda, logo_url, meta_descripcion, descripcion")
    .limit(1)
    .single();
  const tc: any = data || {};
  const nombre = tc.nombre_tienda || "Tienda";
  const tagline = tc.meta_descripcion || tc.descripcion || "";
  const logo = optimizeLogo(tc.logo_url || "");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #ec4899 0%, #be185d 100%)",
          padding: "80px",
          color: "white",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {/* Decorative circles */}
        <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: "rgba(255,255,255,0.08)", display: "flex" }} />
        <div style={{ position: "absolute", bottom: -120, left: -80, width: 320, height: 320, borderRadius: "50%", background: "rgba(255,255,255,0.06)", display: "flex" }} />
        <div style={{ position: "absolute", top: 200, right: 200, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.05)", display: "flex" }} />

        {/* Header: logo + name */}
        <div style={{ display: "flex", alignItems: "center", gap: 28, zIndex: 1 }}>
          {logo ? (
            <div style={{ display: "flex", width: 110, height: 110, borderRadius: 24, background: "white", padding: 14, alignItems: "center", justifyContent: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt={nombre} width={82} height={82} style={{ objectFit: "contain" }} />
            </div>
          ) : (
            <div style={{ display: "flex", width: 110, height: 110, borderRadius: 24, background: "white", color: "#ec4899", fontSize: 64, fontWeight: 800, alignItems: "center", justifyContent: "center" }}>
              {nombre.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, letterSpacing: "-0.02em" }}>{nombre}</div>
        </div>

        {/* Tagline */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", marginTop: 20, zIndex: 1 }}>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.01em", maxWidth: 980 }}>
            {tagline}
          </div>
        </div>

        {/* Footer line */}
        <div style={{ display: "flex", alignItems: "center", gap: 24, zIndex: 1 }}>
          <div style={{ display: "flex", width: 80, height: 4, background: "white", borderRadius: 2 }} />
          <div style={{ display: "flex", fontSize: 28, fontWeight: 500, opacity: 0.92 }}>
            Comprá online · Envíos a domicilio
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
