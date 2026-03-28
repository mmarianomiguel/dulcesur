import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Build a SEO-friendly product URL slug: slugified-name-shortId
 * e.g. "galletitas-oreo-x12-d13ef5de"
 */
export function productSlug(nombre: string, id: string): string {
  return `${slugify(nombre)}-${id.split("-")[0]}`;
}
