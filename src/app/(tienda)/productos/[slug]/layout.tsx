import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Metadata } from "next";

async function getProduct(slug: string) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  // slug can be UUID or partial ID
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(slug)) {
    const { data } = await supabase
      .from("productos")
      .select("nombre, precio, imagen_url, categorias(nombre)")
      .eq("id", slug)
      .eq("activo", true)
      .single();
    return data;
  }

  // Slug format: nombre-shortId (last 8 hex chars = first segment of UUID)
  const parts = slug.split("-");
  const shortId = parts[parts.length - 1];
  if (shortId && /^[0-9a-f]{8}$/i.test(shortId)) {
    const lower = `${shortId}-0000-0000-0000-000000000000`;
    const upper = `${shortId}-ffff-ffff-ffff-ffffffffffff`;
    const { data } = await supabase
      .from("productos")
      .select("nombre, precio, imagen_url, categorias(nombre)")
      .gte("id", lower)
      .lte("id", upper)
      .eq("activo", true)
      .limit(1)
      .maybeSingle();
    return data;
  }

  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) return { title: "Producto no encontrado" };

  const title = product.nombre;
  const category = (product.categorias as unknown as { nombre: string } | null)?.nombre;
  const description = `Comprá ${product.nombre} a $${Math.round(product.precio).toLocaleString("es-AR")}${category ? ` - ${category}` : ""}`;
  const image = product.imagen_url || undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(image
        ? { images: [{ url: image, width: 800, height: 600 }] }
        : {}),
    },
  };
}

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
