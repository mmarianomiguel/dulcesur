/**
 * Custom Next.js image loader for Cloudinary URLs.
 * Inserts width + quality + auto-format transformations so Cloudinary
 * serves a pre-resized image instead of Next.js downloading the full-size original.
 * For non-Cloudinary URLs the src is returned unchanged.
 */
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
  const q = quality ?? 80;
  // Insert transformations after /upload/ — handles versioned URLs like /upload/v1234/...
  return src.replace("/upload/", `/upload/w_${width},q_${q}/`);
}
