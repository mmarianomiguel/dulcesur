"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { showAdminToast } from "@/components/admin-toast";
import {
  Search, X, Loader2, Download, Sparkles, ImageIcon, RefreshCw, Plus, Trash2,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

type Tipo = "oferta" | "nuevos" | "custom";
type Formato = "post" | "story";

interface ProductoOpt {
  id: string;
  nombre: string;
  precio: number;
  imagen_url: string | null;
}

const DEFAULT_TITULOS: Record<Tipo, { titulo: string; subtitulo: string; color: string }> = {
  oferta: { titulo: "OFERTAS", subtitulo: "¡IMPERDIBLES!", color: "#e91e63" },
  nuevos: { titulo: "NUEVOS INGRESOS", subtitulo: "¡LLEGARON!", color: "#7c3aed" },
  custom: { titulo: "PROMO", subtitulo: "¡APROVECHALA!", color: "#0891b2" },
};

export default function MarketingImagenesPage() {
  const [tipo, setTipo] = useState<Tipo>("oferta");
  const [formato, setFormato] = useState<Formato>("post");
  const [titulo, setTitulo] = useState("OFERTAS");
  const [subtitulo, setSubtitulo] = useState("¡IMPERDIBLES!");
  const [color, setColor] = useState("#e91e63");
  const [productos, setProductos] = useState<ProductoOpt[]>([]);
  const [precio, setPrecio] = useState("");
  const [precioUnidad, setPrecioUnidad] = useState("");
  const [tituloPromo, setTituloPromo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [disclaimer, setDisclaimer] = useState("*Ofertas sujetas a cambios y/o modificaciones sin previo aviso. Imágenes ilustrativas.");
  const [bgBase64, setBgBase64] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  // Búsqueda de productos
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ProductoOpt[]>([]);
  const [searching, setSearching] = useState(false);

  const [generating, setGenerating] = useState(false);

  // Persistencia local del fondo y logo
  useEffect(() => {
    try {
      const bg = localStorage.getItem("marketing-bg");
      if (bg) setBgBase64(bg);
      const lg = localStorage.getItem("marketing-logo");
      if (lg) setLogoBase64(lg);
    } catch {}
    // Cargar logo de empresa si no hay
    if (!localStorage.getItem("marketing-logo")) {
      supabase.from("empresa").select("white_label").limit(1).single().then(({ data }) => {
        const url = (data?.white_label as any)?.logo_url;
        if (url) {
          fetch(url)
            .then((r) => r.blob())
            .then((blob) => {
              const fr = new FileReader();
              fr.onloadend = () => {
                if (fr.result) {
                  const src = fr.result as string;
                  setLogoBase64(src);
                  localStorage.setItem("marketing-logo", src);
                }
              };
              fr.readAsDataURL(blob);
            }).catch(() => {});
        }
      });
    }
  }, []);

  // Preset por tipo
  useEffect(() => {
    const def = DEFAULT_TITULOS[tipo];
    setTitulo(def.titulo);
    setSubtitulo(def.subtitulo);
    setColor(def.color);
  }, [tipo]);

  // Búsqueda de productos
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const tid = setTimeout(async () => {
      const { data } = await supabase
        .from("productos")
        .select("id, nombre, precio, imagen_url")
        .ilike("nombre", `%${q}%`)
        .eq("activo", true)
        .limit(10);
      if (!cancelled) {
        setSearchResults((data as ProductoOpt[]) || []);
        setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(tid); };
  }, [search]);

  const addProducto = (p: ProductoOpt) => {
    if (productos.length >= 9) {
      showAdminToast("Máximo 9 productos por imagen", "error");
      return;
    }
    if (productos.some((x) => x.id === p.id)) return;
    setProductos((prev) => [...prev, p]);
    setSearch("");
    setSearchResults([]);
  };

  const removeProducto = (id: string) => setProductos((prev) => prev.filter((p) => p.id !== id));

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const src = r.result as string;
      setBgBase64(src);
      try { localStorage.setItem("marketing-bg", src); } catch {}
    };
    r.readAsDataURL(file);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const src = r.result as string;
      setLogoBase64(src);
      try { localStorage.setItem("marketing-logo", src); } catch {}
    };
    r.readAsDataURL(file);
  };

  const previewRef = useRef<HTMLDivElement>(null);

  const downloadImage = async () => {
    if (!previewRef.current) return;
    setGenerating(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(previewRef.current, {
        backgroundColor: null,
        scale: 2,
        logging: false,
        useCORS: true,
      });
      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fname = `${titulo.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.png`;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showAdminToast("Imagen descargada", "success");
    } catch (err: any) {
      console.error(err);
      showAdminToast(`Error al generar la imagen: ${err?.message || ""}`, "error");
    } finally {
      setGenerating(false);
    }
  };

  // Dimensions
  const W = formato === "post" ? 1080 : 1080;
  const H = formato === "post" ? 1080 : 1920;
  // Preview scale (max 360px en alto del preview side)
  const previewMaxW = 380;
  const scale = previewMaxW / W;
  const previewW = W * scale;
  const previewH = H * scale;

  // Layout de productos según cantidad
  const productLayout = useMemo(() => {
    const n = productos.length;
    if (n === 0) return null;
    if (n === 1) return { cols: 1, rows: 1 };
    if (n <= 3) return { cols: n, rows: 1 };
    if (n <= 6) return { cols: 3, rows: 2 };
    return { cols: 3, rows: 3 };
  }, [productos.length]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-pink-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Generador de imágenes</h2>
          <p className="text-sm text-muted-foreground">Carteles para ofertas, nuevos ingresos y promos. Descargás como PNG y publicás en redes.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px,1fr] gap-6">
        {/* ─── FORM ─── */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-4">
              {/* Tipo */}
              <div className="space-y-2">
                <Label>Tipo de cartel</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["oferta", "nuevos", "custom"] as Tipo[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTipo(t)}
                      className={`text-xs font-medium px-2 py-2 rounded-lg border transition-all ${
                        tipo === t
                          ? "bg-foreground text-background border-foreground"
                          : "border-border bg-background hover:bg-accent"
                      }`}
                    >
                      {t === "oferta" ? "Oferta" : t === "nuevos" ? "Nuevos" : "Custom"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Formato */}
              <div className="space-y-2">
                <Label>Formato</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["post", "story"] as Formato[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormato(f)}
                      className={`text-xs font-medium px-2 py-2 rounded-lg border transition-all ${
                        formato === f
                          ? "bg-foreground text-background border-foreground"
                          : "border-border bg-background hover:bg-accent"
                      }`}
                    >
                      {f === "post" ? "Post (1080×1080)" : "Story (1080×1920)"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Título principal */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Título</Label>
                  <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Subtítulo</Label>
                  <Input value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} className="h-9" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Color principal</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-10 h-9 rounded border border-border bg-transparent cursor-pointer"
                  />
                  <Input value={color} onChange={(e) => setColor(e.target.value)} className="h-9 font-mono text-xs" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Productos */}
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center justify-between">
                <Label>Productos ({productos.length}/9)</Label>
                {productos.length > 0 && (
                  <button onClick={() => setProductos([])} className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Quitar todos
                  </button>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
                {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
              {searchResults.length > 0 && (
                <div className="border rounded-lg divide-y bg-background max-h-60 overflow-y-auto">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProducto(p)}
                      className="w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-center gap-2"
                    >
                      {p.imagen_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imagen_url} alt="" className="w-8 h-8 rounded object-contain" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center"><ImageIcon className="w-4 h-4 text-muted-foreground" /></div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.nombre}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(p.precio)}</p>
                      </div>
                      <Plus className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
              {productos.length > 0 && (
                <div className="space-y-1.5">
                  {productos.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-2 border rounded-lg px-2 py-1.5 bg-background">
                      <span className="text-[10px] text-muted-foreground w-4 text-center">{i + 1}</span>
                      {p.imagen_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imagen_url} alt="" className="w-7 h-7 rounded object-contain" />
                      ) : (
                        <div className="w-7 h-7 rounded bg-muted" />
                      )}
                      <p className="text-xs font-medium truncate flex-1">{p.nombre}</p>
                      <button onClick={() => removeProducto(p.id)} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Texto promo */}
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Precio destacado</Label>
                  <Input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$19.800" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Precio c/u (opcional)</Label>
                  <Input value={precioUnidad} onChange={(e) => setPrecioUnidad(e.target.value)} placeholder="$1.100" className="h-9" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Título de la promo</Label>
                <Input value={tituloPromo} onChange={(e) => setTituloPromo(e.target.value)} placeholder="Promo Alfajores Arcor Surtidos" className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Descripción</Label>
                <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="18 Unidades surtidas (3 c/u)" className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Disclaimer (chico, abajo)</Label>
                <Input value={disclaimer} onChange={(e) => setDisclaimer(e.target.value)} className="h-9 text-xs" />
              </div>
            </CardContent>
          </Card>

          {/* Assets */}
          <Card>
            <CardContent className="pt-5 space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Recursos</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Fondo</Label>
                  <div className="border border-dashed border-border rounded-lg p-2 flex flex-col items-center gap-1.5 bg-muted/20">
                    {bgBase64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={bgBase64} alt="" className="w-full h-12 object-cover rounded" />
                    ) : (
                      <span className="text-[11px] text-muted-foreground py-2">Sin fondo</span>
                    )}
                    <label className="cursor-pointer text-[11px] text-center w-full border border-border rounded px-2 py-1 hover:bg-accent">
                      {bgBase64 ? "Cambiar" : "Subir fondo"}
                      <input type="file" accept="image/*" onChange={handleBgUpload} className="hidden" />
                    </label>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Logo</Label>
                  <div className="border border-dashed border-border rounded-lg p-2 flex flex-col items-center gap-1.5 bg-muted/20">
                    {logoBase64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoBase64} alt="" className="w-full h-12 object-contain rounded" />
                    ) : (
                      <span className="text-[11px] text-muted-foreground py-2">Sin logo</span>
                    )}
                    <label className="cursor-pointer text-[11px] text-center w-full border border-border rounded px-2 py-1 hover:bg-accent">
                      {logoBase64 ? "Cambiar" : "Subir logo"}
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button onClick={downloadImage} disabled={generating || productos.length === 0} className="w-full h-11">
            {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Descargar PNG ({W}×{H})
          </Button>
        </div>

        {/* ─── PREVIEW ─── */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Preview</Label>
            <span className="text-[11px] text-muted-foreground">
              {productos.length === 0 ? "Agregá productos" : `${productos.length} producto${productos.length !== 1 ? "s" : ""}`}
            </span>
          </div>
          <div className="flex items-center justify-center bg-muted/30 rounded-2xl p-4 sm:p-6 border border-border" style={{ minHeight: 400 }}>
            {/* Wrapper escalado */}
            <div
              style={{
                width: previewW,
                height: previewH,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Versión "real" 1080x1080 escalada */}
              <div
                ref={previewRef}
                style={{
                  width: W,
                  height: H,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  position: "relative",
                  background: "white",
                  fontFamily: "'Anton', 'Bebas Neue', system-ui, sans-serif",
                }}
              >
                <PosterTemplate
                  width={W}
                  height={H}
                  bg={bgBase64}
                  logo={logoBase64}
                  titulo={titulo}
                  subtitulo={subtitulo}
                  color={color}
                  productos={productos}
                  precio={precio}
                  precioUnidad={precioUnidad}
                  tituloPromo={tituloPromo}
                  descripcion={descripcion}
                  disclaimer={disclaimer}
                  layout={productLayout}
                />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            Salida final: {W}×{H} px (escalado x{scale.toFixed(2)} para preview)
          </p>
        </div>
      </div>

      {/* Google fonts */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Pacifico&display=swap" />
    </div>
  );
}

interface PosterProps {
  width: number;
  height: number;
  bg: string | null;
  logo: string | null;
  titulo: string;
  subtitulo: string;
  color: string;
  productos: ProductoOpt[];
  precio: string;
  precioUnidad: string;
  tituloPromo: string;
  descripcion: string;
  disclaimer: string;
  layout: { cols: number; rows: number } | null;
}

function PosterTemplate({
  width, height, bg, logo, titulo, subtitulo, color, productos,
  precio, precioUnidad, tituloPromo, descripcion, disclaimer, layout,
}: PosterProps) {
  const isStory = height > width;
  const titleSize = isStory ? 200 : 170;
  const subtitleSize = isStory ? 90 : 80;
  const productAreaTop = isStory ? 720 : 460;
  const productAreaH = isStory ? 800 : 460;
  const productAreaW = width - 100;
  const cols = layout?.cols ?? 1;
  const rows = layout?.rows ?? 1;
  const cellW = productAreaW / cols;
  const cellH = productAreaH / rows;

  // Lighten color to gradient
  const bgGradient = `linear-gradient(180deg, ${color}66 0%, ${color}11 35%, #ffffff 70%)`;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Background gradient */}
      <div style={{ position: "absolute", inset: 0, background: bgGradient }} />
      {/* Background pattern (PNG) */}
      {bg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bg}
          alt=""
          crossOrigin="anonymous"
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", opacity: 0.7, mixBlendMode: "multiply",
          }}
        />
      )}

      {/* Logo arriba */}
      {logo && (
        <div style={{ position: "absolute", top: isStory ? 60 : 40, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" crossOrigin="anonymous" style={{ height: isStory ? 130 : 110, objectFit: "contain" }} />
        </div>
      )}

      {/* Título */}
      <div style={{ position: "absolute", top: isStory ? 240 : 180, left: 0, right: 0, textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "'Anton', 'Bebas Neue', sans-serif",
            fontSize: titleSize,
            fontWeight: 900,
            margin: 0,
            color,
            lineHeight: 0.95,
            letterSpacing: "-0.02em",
            WebkitTextStroke: `8px white`,
            paintOrder: "stroke fill",
            textShadow: `0 6px 0 ${color}33`,
          }}
        >
          {titulo}
        </h1>
        <p
          style={{
            fontFamily: "'Pacifico', cursive",
            fontSize: subtitleSize,
            margin: 0,
            marginTop: 10,
            color,
            lineHeight: 1,
          }}
        >
          {subtitulo}
        </p>
      </div>

      {/* Productos grid */}
      {productos.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: productAreaTop,
            left: 50,
            width: productAreaW,
            height: productAreaH,
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            gap: 0,
          }}
        >
          {productos.slice(0, cols * rows).map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
              {p.imagen_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imagen_url}
                  alt={p.nombre}
                  crossOrigin="anonymous"
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              ) : (
                <div style={{ width: "80%", height: "80%", background: "#eee", borderRadius: 12 }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Precio destacado */}
      {precio && (
        <div
          style={{
            position: "absolute",
            top: isStory ? 1480 : 820,
            right: 60,
            background: "white",
            borderRadius: 30,
            padding: "20px 36px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: "'Anton', sans-serif",
              fontSize: 90,
              color,
              lineHeight: 1,
              fontWeight: 900,
            }}
          >
            {precio}
          </div>
          {precioUnidad && (
            <div style={{ marginTop: 6 }}>
              <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 50, color, fontWeight: 700 }}>{precioUnidad}</span>
              <span style={{ fontSize: 22, color: "#666", marginLeft: 6, fontFamily: "system-ui" }}>c/u</span>
              <div style={{ fontSize: 16, color: "#999", fontFamily: "system-ui" }}>Precio Final</div>
            </div>
          )}
        </div>
      )}

      {/* Pill título promo */}
      {tituloPromo && (
        <div
          style={{
            position: "absolute",
            bottom: isStory ? 220 : 130,
            left: 60,
            right: 60,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: color,
              color: "white",
              fontSize: 36,
              fontWeight: 700,
              padding: "18px 40px",
              borderRadius: 100,
              fontFamily: "system-ui, sans-serif",
              textAlign: "center",
              boxShadow: `0 4px 16px ${color}55`,
            }}
          >
            {tituloPromo}
          </div>
        </div>
      )}

      {/* Descripción */}
      {descripcion && (
        <div
          style={{
            position: "absolute",
            bottom: isStory ? 160 : 80,
            left: 60,
            right: 60,
            textAlign: "center",
            fontSize: 28,
            color: "#444",
            fontFamily: "system-ui, sans-serif",
            fontWeight: 500,
          }}
        >
          {descripcion}
        </div>
      )}

      {/* Disclaimer */}
      {disclaimer && (
        <div
          style={{
            position: "absolute",
            bottom: 30,
            left: 60,
            right: 60,
            textAlign: "center",
            fontSize: 16,
            color: "#999",
            fontFamily: "system-ui, sans-serif",
            fontStyle: "italic",
          }}
        >
          {disclaimer}
        </div>
      )}
    </div>
  );
}
