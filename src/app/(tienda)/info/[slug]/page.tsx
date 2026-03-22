"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";
import EnviosDinamico from "@/components/tienda/envios-dinamico";

interface Pagina {
  id: string;
  titulo: string;
  contenido: string;
}

export default function InfoPage() {
  const { slug } = useParams();
  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data } = await supabase
        .from("paginas_info")
        .select("id, titulo, contenido")
        .eq("slug", slug)
        .eq("activa", true)
        .single();
      if (data) setPagina(data as Pagina);
      else setNotFound(true);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Página no encontrada</h1>
        <p className="text-gray-500 mb-6">La página que buscás no existe o fue desactivada.</p>
        <Link href="/" className="text-pink-600 hover:text-pink-700 font-medium">Volver al inicio</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-pink-600 transition-colors mb-6 text-sm font-medium">
        <ArrowLeft className="w-4 h-4" />Volver al inicio
      </Link>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">{pagina?.titulo}</h1>
      {slug === "envios" ? (
        <EnviosDinamico />
      ) : (
        <div
          className="prose prose-gray max-w-none prose-headings:text-gray-900 prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-p:text-gray-600 prose-p:leading-relaxed prose-li:text-gray-600 prose-strong:text-gray-900 prose-a:text-pink-600"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(pagina?.contenido || "") }}
        />
      )}
    </div>
  );
}
