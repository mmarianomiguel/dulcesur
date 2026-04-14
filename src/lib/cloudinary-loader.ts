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
  const q = quality ?? 75;
  const w = snapWidth(width);
  // f_auto sirve WebP en navegadores que lo soportan, JPEG en los que no
  return src.replace("/upload/", `/upload/w_${w},q_${q},f_auto/`);
}
