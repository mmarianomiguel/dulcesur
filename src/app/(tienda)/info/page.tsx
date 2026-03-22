"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  ArrowLeft, Loader2, Banknote, Truck, ShoppingBag, UserPlus, HelpCircle,
  FileText, MessageCircle,
} from "lucide-react";

interface Pagina {
  id: string;
  slug: string;
  titulo: string;
  contenido: string;
  orden?: number;
}

const slugIcons: Record<string, typeof Banknote> = {
  "medios-de-pago": Banknote,
  envios: Truck,
  "como-comprar": ShoppingBag,
  "como-registrarse": UserPlus,
  faq: HelpCircle,
  terminos: FileText,
  contacto: MessageCircle,
};

const SLUG_ORDER = [
  "medios-de-pago",
  "envios",
  "como-comprar",
  "como-registrarse",
  "faq",
  "terminos",
  "contacto",
];

export default function InfoAllPage() {
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSlug, setActiveSlug] = useState("");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("paginas_info")
        .select("id, slug, titulo, contenido, orden")
        .eq("activa", true)
        .order("orden", { ascending: true });
      if (data) {
        const sorted = (data as Pagina[]).sort((a, b) => {
          const ia = SLUG_ORDER.indexOf(a.slug);
          const ib = SLUG_ORDER.indexOf(b.slug);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });
        setPaginas(sorted);
        if (sorted.length > 0) setActiveSlug(sorted[0].slug);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (paginas.length === 0) return;
    const hash = window.location.hash.replace("#", "");
    if (hash && sectionRefs.current[hash]) {
      setTimeout(() => {
        sectionRefs.current[hash]?.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveSlug(hash);
      }, 100);
    }
  }, [paginas]);

  useEffect(() => {
    if (paginas.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSlug(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    for (const p of paginas) {
      const el = sectionRefs.current[p.slug];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [paginas]);

  const scrollTo = (slug: string) => {
    sectionRefs.current[slug]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSlug(slug);
    window.history.replaceState(null, "", "#" + slug);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (paginas.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <FileText className="mx-auto mb-4 h-16 w-16 text-gray-300" />
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Sin informaci&oacute;n disponible</h1>
        <p className="mb-6 text-gray-500">A&uacute;n no se cargaron p&aacute;ginas informativas.</p>
        <Link href="/" className="font-medium text-pink-600 hover:text-pink-700">
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-pink-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al inicio
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Informaci&oacute;n</h1>
        <p className="mt-1 text-gray-500">Todo lo que necesit&aacute;s saber sobre nuestra tienda</p>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-2 lg:hidden">
        {paginas.map((p) => {
          const isActive = activeSlug === p.slug;
          return (
            <button
              key={p.slug}
              onClick={() => scrollTo(p.slug)}
              className={
                "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition " +
                (isActive ? "bg-pink-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")
              }
            >
              {p.titulo}
            </button>
          );
        })}
      </div>

      <div className="flex gap-8">
        <nav className="hidden shrink-0 lg:block lg:w-56">
          <div className="sticky top-24 space-y-1">
            {paginas.map((p) => {
              const Icon = slugIcons[p.slug] || FileText;
              const isActive = activeSlug === p.slug;
              return (
                <button
                  key={p.slug}
                  onClick={() => scrollTo(p.slug)}
                  className={
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition " +
                    (isActive
                      ? "bg-pink-50 font-medium text-pink-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900")
                  }
                >
                  <Icon className={"h-4 w-4 shrink-0 " + (isActive ? "text-pink-600" : "text-gray-400")} />
                  {p.titulo}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0 flex-1">
          <div className="space-y-12">
            {paginas.map((p, i) => {
              const Icon = slugIcons[p.slug] || FileText;
              return (
                <section
                  key={p.id}
                  id={p.slug}
                  ref={(el) => {
                    sectionRefs.current[p.slug] = el;
                  }}
                  className="scroll-mt-24"
                >
                  {i > 0 && <hr className="mb-10 border-gray-200" />}
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50">
                      <Icon className="h-5 w-5 text-pink-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">{p.titulo}</h2>
                  </div>
                  <div
                    className="prose prose-gray max-w-none prose-headings:text-gray-900 prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-4 prose-h3:text-lg prose-p:text-gray-600 prose-p:leading-relaxed prose-li:text-gray-600 prose-strong:text-gray-900 prose-a:text-pink-600"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(p.contenido || "") }}
                  />
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
