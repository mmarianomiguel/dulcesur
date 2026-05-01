/**
 * Loader híbrido durante la migración Cloudinary → Supabase Storage.
 * - URLs de Cloudinary: inserta transformaciones w_/q_/f_auto/dpr_auto (igual que el loader anterior).
 * - URLs de Supabase Storage públicas: redirige al endpoint /render/image/public (image transformation, requiere Pro)
 *   con width + quality. Supabase devuelve WebP/AVIF según Accept del navegador.
 * - Otras URLs: se devuelven tal cual.
 */
const ALLOWED_WIDTHS = [200, 400, 800, 1200];

function snapWidth(width: number): number {
  for (const w of ALLOWED_WIDTHS) {
    if (width <= w) return w;
  }
  return ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1];
}

export default function imageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  if (!src) return src;

  const w = snapWidth(width);

  if (src.includes("res.cloudinary.com")) {
    const qParam = quality ? `q_${quality}` : "q_auto:eco";
    return src.replace("/upload/", `/upload/w_${w},${qParam},f_auto,dpr_auto/`);
  }

  if (src.includes(".supabase.co/storage/v1/object/public/")) {
    const rendered = src.replace(
      "/storage/v1/object/public/",
      "/storage/v1/render/image/public/"
    );
    const url = new URL(rendered);
    url.searchParams.set("width", String(w));
    url.searchParams.set("quality", String(quality ?? 70));
    return url.toString();
  }

  return src;
}
