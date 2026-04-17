/**
 * Custom Next.js image loader for Cloudinary URLs.
 * Inserts width + quality + auto-format transformations so Cloudinary
 * serves a pre-resized image instead of Next.js downloading the full-size original.
 * For non-Cloudinary URLs the src is returned unchanged.
 *
 * Anchos permitidos — Cloudinary cachea una versión por ancho.
 * Cuantos menos anchos distintos, menos transformaciones y menos bandwidth.
 */
const ALLOWED_WIDTHS = [200, 400, 800, 1200];

function snapWidth(width: number): number {
  for (const w of ALLOWED_WIDTHS) {
    if (width <= w) return w;
  }
  return ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1];
}

export default function cloudinaryLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  if (!src || !src.includes("res.cloudinary.com")) return src;
  // q_auto:eco deja a Cloudinary elegir la calidad óptima según el contenido
  // (generalmente ~60–70) logrando mayor ahorro que un q fijo de 75.
  const qParam = quality ? `q_${quality}` : "q_auto:eco";
  const w = snapWidth(width);
  // f_auto sirve WebP/AVIF según navegador, JPEG en los que no
  return src.replace("/upload/", `/upload/w_${w},${qParam},f_auto,dpr_auto/`);
}
