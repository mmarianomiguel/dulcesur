"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { showAdminToast } from "@/components/admin-toast";
import {
  Search, X, Loader2, Download, Sparkles, ImageIcon,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

type Tipo = "oferta" | "nuevo" | "promo";
type Formato = "post" | "story";

interface ProductoOpt {
  id: string;
  nombre: string;
  precio: number;
  imagen_url: string | null;
}

const TIPO_PRESETS: Record<Tipo, { titulo: string; color: string }> = {
  oferta: { titulo: "OFERTA", color: "#e91e63" },
  nuevo: { titulo: "NUEVO INGRESO", color: "#7c3aed" },
  promo: { titulo: "PROMO", color: "#0891b2" },
};

export default function MarketingImagenesPage() {
  const [tipo, setTipo] = useState<Tipo>("oferta");
  const [formato, setFormato] = useState<Formato>("post");
  const [titulo, setTitulo] = useState("OFERTA");
  const [color, setColor] = useState("#e91e63");
  const [producto, setProducto] = useState<ProductoOpt | null>(null);
  const [precioCustom, setPrecioCustom] = useState("");
  const [precioAntes, setPrecioAntes] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  // Búsqueda
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ProductoOpt[]>([]);
  const [searching, setSearching] = useState(false);

  const [generating, setGenerating] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Logo de empresa
  useEffect(() => {
    try {
      const lg = localStorage.getItem("marketing-logo");
      if (lg) { setLogoBase64(lg); return; }
    } catch {}
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
                try { localStorage.setItem("marketing-logo", src); } catch {}
              }
            };
            fr.readAsDataURL(blob);
          })
          .catch(() => {});
      }
    });
  }, []);

  // Preset por tipo
  useEffect(() => {
    const def = TIPO_PRESETS[tipo];
    setTitulo(def.titulo);
    setColor(def.color);
  }, [tipo]);

  // Búsqueda
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
      const safeName = (producto?.nombre || titulo).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
      a.download = `${safeName}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showAdminToast("Imagen descargada", "success");
    } catch (err: any) {
      console.error(err);
      showAdminToast(`Error: ${err?.message || ""}`, "error");
    } finally {
      setGenerating(false);
    }
  };

  const W = 1080;
  const H = formato === "post" ? 1080 : 1920;
  const previewMaxW = 360;
  const scale = previewMaxW / W;

  const precioFinal = precioCustom || (producto ? formatCurrency(producto.precio) : "");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-pink-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Generador de carteles</h2>
          <p className="text-sm text-muted-foreground">Cartel rápido para 1 producto. Para combos complejos usá Canva.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px,1fr] gap-6">
        {/* FORM */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["oferta", "nuevo", "promo"] as Tipo[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTipo(t)}
                      className={`text-xs font-medium px-2 py-2 rounded-lg border transition-all capitalize ${
                        tipo === t ? "bg-foreground text-background border-foreground" : "border-border hover:bg-accent"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Formato</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["post", "story"] as Formato[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormato(f)}
                      className={`text-xs font-medium px-2 py-2 rounded-lg border transition-all ${
                        formato === f ? "bg-foreground text-background border-foreground" : "border-border hover:bg-accent"
                      }`}
                    >
                      {f === "post" ? "Post 1080×1080" : "Story 1080×1920"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Título</Label>
                  <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-9 h-9 rounded border border-border bg-transparent cursor-pointer"
                    />
                    <Input value={color} onChange={(e) => setColor(e.target.value)} className="h-9 font-mono text-xs flex-1" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Producto */}
          <Card>
            <CardContent className="pt-5 space-y-3">
              <Label>Producto</Label>
              {producto ? (
                <div className="flex items-center gap-2 border rounded-lg px-2 py-2 bg-background">
                  {producto.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={producto.imagen_url} alt="" className="w-10 h-10 rounded object-contain" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{producto.nombre}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(producto.precio)}</p>
                  </div>
                  <button onClick={() => setProducto(null)} className="text-muted-foreground hover:text-destructive">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
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
                          onClick={() => { setProducto(p); setSearch(""); setSearchResults([]); }}
                          className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2"
                        >
                          {p.imagen_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imagen_url} alt="" className="w-8 h-8 rounded object-contain" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-muted" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.nombre}</p>
                            <p className="text-xs text-muted-foreground">{formatCurrency(p.precio)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Precios y texto */}
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Precio (override)</Label>
                  <Input
                    value={precioCustom}
                    onChange={(e) => setPrecioCustom(e.target.value)}
                    placeholder={producto ? formatCurrency(producto.precio) : "$1.250"}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Antes (opcional)</Label>
                  <Input
                    value={precioAntes}
                    onChange={(e) => setPrecioAntes(e.target.value)}
                    placeholder="$1.500"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Descripción (opcional)</Label>
                <Input
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Promo válida hasta el viernes"
                  className="h-9"
                />
              </div>
            </CardContent>
          </Card>

          {/* Logo */}
          <Card>
            <CardContent className="pt-5 space-y-2">
              <Label className="text-xs">Logo</Label>
              <div className="border border-dashed border-border rounded-lg p-2 flex items-center gap-3">
                {logoBase64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoBase64} alt="" className="h-12 object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground py-2">Sin logo</span>
                )}
                <label className="ml-auto cursor-pointer text-xs text-center border border-border rounded px-2 py-1 hover:bg-accent">
                  {logoBase64 ? "Cambiar" : "Subir"}
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
              </div>
            </CardContent>
          </Card>

          <Button onClick={downloadImage} disabled={generating || !producto} className="w-full h-11">
            {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Descargar PNG ({W}×{H})
          </Button>
        </div>

        {/* PREVIEW */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-3 block">Preview</Label>
          <div className="flex items-center justify-center bg-muted/30 rounded-2xl p-4 sm:p-6 border border-border" style={{ minHeight: 400 }}>
            <div style={{ width: W * scale, height: H * scale, position: "relative", overflow: "hidden" }}>
              <div
                ref={previewRef}
                style={{
                  width: W,
                  height: H,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  position: "relative",
                  background: "white",
                }}
              >
                <CartelTemplate
                  width={W}
                  height={H}
                  logo={logoBase64}
                  titulo={titulo}
                  color={color}
                  producto={producto}
                  precio={precioFinal}
                  precioAntes={precioAntes}
                  descripcion={descripcion}
                />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            {W}×{H} px (escalado x{scale.toFixed(2)})
          </p>
        </div>
      </div>

      {/* Google fonts */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800;900&family=Bebas+Neue&display=swap" />
    </div>
  );
}

interface CartelProps {
  width: number;
  height: number;
  logo: string | null;
  titulo: string;
  color: string;
  producto: ProductoOpt | null;
  precio: string;
  precioAntes: string;
  descripcion: string;
}

function CartelTemplate({ width, height, logo, titulo, color, producto, precio, precioAntes, descripcion }: CartelProps) {
  const isStory = height > width;
  const padding = 80;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        fontFamily: "'Inter', system-ui, sans-serif",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
      }}
    >
      {/* Decorative shapes */}
      <div style={{ position: "absolute", top: -200, right: -200, width: 600, height: 600, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
      <div style={{ position: "absolute", bottom: -150, left: -150, width: 450, height: 450, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />

      {/* Top: logo + título */}
      <div style={{ position: "absolute", top: padding, left: padding, right: padding, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" crossOrigin="anonymous" style={{ height: isStory ? 90 : 70, objectFit: "contain", filter: "brightness(0) invert(1)" }} />
        ) : <div />}
        <div
          style={{
            background: "white",
            color,
            padding: "10px 28px",
            borderRadius: 100,
            fontFamily: "'Bebas Neue', sans-serif",
            fontWeight: 700,
            fontSize: isStory ? 50 : 42,
            letterSpacing: "0.05em",
            lineHeight: 1,
          }}
        >
          {titulo}
        </div>
      </div>

      {/* Card central con producto */}
      <div
        style={{
          position: "absolute",
          left: padding,
          right: padding,
          top: isStory ? 220 : 180,
          bottom: isStory ? 320 : 240,
          background: "white",
          borderRadius: 40,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
          boxSizing: "border-box",
        }}
      >
        {producto?.imagen_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={producto.imagen_url}
            alt={producto.nombre}
            crossOrigin="anonymous"
            style={{ maxWidth: "85%", maxHeight: "70%", objectFit: "contain", filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.15))" }}
          />
        ) : (
          <div style={{ width: "60%", aspectRatio: "1", background: "#f0f0f0", borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#bbb", fontSize: 32 }}>Sin imagen</span>
          </div>
        )}
        {producto && (
          <p
            style={{
              marginTop: 24,
              marginBottom: 0,
              fontSize: isStory ? 38 : 32,
              fontWeight: 600,
              color: "#111",
              textAlign: "center",
              lineHeight: 1.15,
              maxWidth: "90%",
            }}
          >
            {producto.nombre}
          </p>
        )}
      </div>

      {/* Precio bottom */}
      <div style={{ position: "absolute", bottom: padding, left: padding, right: padding, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {precioAntes && (
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 36, fontWeight: 500, textDecoration: "line-through", marginBottom: 4 }}>
            {precioAntes}
          </div>
        )}
        {precio && (
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: isStory ? 200 : 170,
              fontWeight: 900,
              color: "white",
              lineHeight: 0.9,
              letterSpacing: "-0.02em",
              textShadow: "0 4px 16px rgba(0,0,0,0.25)",
            }}
          >
            {precio}
          </div>
        )}
        {descripcion && (
          <div style={{ marginTop: 16, fontSize: 28, color: "rgba(255,255,255,0.95)", textAlign: "center", fontWeight: 500, maxWidth: "90%" }}>
            {descripcion}
          </div>
        )}
      </div>
    </div>
  );
}
