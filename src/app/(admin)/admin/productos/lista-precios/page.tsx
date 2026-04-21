"use client";

import { SearchableSelect } from "@/components/searchable-select";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { norm, productSlug } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";

import {
  ArrowLeft,
  Search,
  Filter,
  Settings,
  Download,
  FileText,
  Loader2,
  X,
  Check,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// ─── Types ───
interface DBProducto {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  costo: number;
  stock: number;
  activo: boolean;
  categoria_id: string | null;
  subcategoria_id?: string | null;
  marca_id?: string | null;
  fecha_actualizacion: string;
  categorias: { nombre: string } | null;
  marcas: { nombre: string } | null;
  precio_anterior?: number | null;
}

interface DBPresentacion {
  id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio: number;
  precio_oferta: number | null;
}

interface Product {
  nombre: string;
  precioUnitario: number;
  precioCaja: number;
  marca: string;
  enOferta: boolean;
  precioOferta: number;
  cajaEnOferta: boolean;
  precioOfertaCaja: number;
  precioPorCaja: boolean;
  unidadesCaja: number;
  nombrePresentacion: string;
  nombreUnidad: string;
  hayStock: boolean;
  id: string;
  categoria: string;
  subcategoria: string;
  fechaActualizacion: string;
  codigo: string;
  precioAnterior: number;
  esCombo: boolean;
}

interface Filters {
  search: string;
  categoria: string;
  subcategoria: string;
  marca: string;
  enOferta: string;
  cajaEnOferta: string;
  precioPorCaja: string;
  hayStock: string;
  fechaDesde: string;
  fechaHasta: string;
}

interface PdfConfig {
  porcentajeTransferencia: number;
  webUrl: string;
  logoTamaño: number;
  premium_logoTamaño: number;
  premium_tamañoCaption: number;
  premium_tamañoNombre: number;
  premium_tamañoSubtitulo: number;
  premium_tamañoPrecio: number;
  premium_tamañoPrecioUnidad: number;
  premium_mostrarLogo: boolean;
  premium_mostrarWeb: boolean;
  combinado_columnas: number;
  combinado_filas: number;
  combinado_tamañoNombre: number;
  combinado_tamañoPrecio: number;
  combinado_mostrarPrecioCaja: boolean;
  combinado_mostrarLogo: boolean;
  combinado_mostrarWeb: boolean;
  combinado_mostrarFecha: boolean;
  combinado_nombreOffset: number;
  combinado_divisorY: number;
  combinado_efectLabelY: number;
  combinado_efectPrecioY: number;
  combinado_transfLabelY: number;
  combinado_transfPrecioY: number;
  combinado_footerLineY: number;
  combinado_footerTextY: number;
  combinado_footerFontSize: number;
  duo_columnas: number;
  duo_filas: number;
  duo_tamañoNombre: number;
  duo_tamañoPrecio: number;
  duo_mostrarLogo: boolean;
  duo_mostrarWeb: boolean;
  duo_mostrarFecha: boolean;
}

type PdfStyle = "combinado" | "duo" | "simple" | "premium" | "lista" | "variaciones" | "gondola";
type ConfigTab = "general" | PdfStyle;

const DEFAULT_FILTERS: Filters = { search: "", categoria: "", subcategoria: "", marca: "", enOferta: "", cajaEnOferta: "", precioPorCaja: "", hayStock: "", fechaDesde: "", fechaHasta: "" };

const DEFAULT_CONFIG: PdfConfig = {
  porcentajeTransferencia: 2,
  webUrl: "www.dulcesur.com",
  logoTamaño: 10,
  combinado_columnas: 3, combinado_filas: 7, combinado_tamañoNombre: 9, combinado_tamañoPrecio: 22,
  combinado_mostrarPrecioCaja: true, combinado_mostrarLogo: true, combinado_mostrarWeb: true, combinado_mostrarFecha: true,
  combinado_nombreOffset: 1, combinado_divisorY: 15, combinado_efectLabelY: 13.5, combinado_efectPrecioY: 11, combinado_transfLabelY: 9, combinado_transfPrecioY: 6.5, combinado_footerLineY: 4.5, combinado_footerTextY: 2, combinado_footerFontSize: 5,
  duo_columnas: 2, duo_filas: 4, duo_tamañoNombre: 11, duo_tamañoPrecio: 24,
  duo_mostrarLogo: true, duo_mostrarWeb: true, duo_mostrarFecha: true,
  premium_logoTamaño: 18, premium_tamañoCaption: 9, premium_tamañoNombre: 52, premium_tamañoSubtitulo: 15, premium_tamañoPrecio: 68, premium_tamañoPrecioUnidad: 28, premium_mostrarLogo: true, premium_mostrarWeb: true,
};


function clasificarProducto(nombre: string): { categoria: string; subcategoria: string } {
  const n = nombre.toLowerCase();
  if (/\b(coca[- ]?cola|pepsi|sprite|fanta|7\s?up|mirinda|schweppes|paso de los toros|tonica|gaseosa|soda)\b/.test(n)) return { categoria: "Bebidas", subcategoria: "Gaseosas" };
  if (/\b(agua mineral|agua\s|cellier|villavicencio|glaciar|eco de los andes)\b/.test(n)) return { categoria: "Bebidas", subcategoria: "Aguas" };
  if (/\b(jugo|cepita|baggio|tang|arcor juice|ades)\b/.test(n)) return { categoria: "Bebidas", subcategoria: "Jugos" };
  if (/\b(cerveza|brahma|quilmes|stella|heineken|corona|patagonia|imperial|andes)\b/.test(n)) return { categoria: "Bebidas", subcategoria: "Cervezas" };
  if (/\b(vino|malbec|cabernet|torrontés|chandon|champagne|espumante|fernet|branca|campari|aperitivo|gancia|vermouth|vodka|whisky|ron|gin|speed|energizante|red bull|monster)\b/.test(n)) return { categoria: "Bebidas", subcategoria: "Bebidas alcohólicas" };
  if (/\b(mate cocido|té |te |taragui|yerba|playadito|rosamonte|cbse|amanda|nobleza)\b/.test(n)) return { categoria: "Bebidas", subcategoria: "Infusiones y Yerba" };
  if (/\b(café|cafe|nescafe|dolca|cabrales)\b/.test(n)) return { categoria: "Bebidas", subcategoria: "Café" };
  if (/\b(chocolate|bon o bon|shot|cofler|block|milka|toblerone|kinder|ferrero|aguila|capri|bombón|bombon|garoto|rocklets|rhodesia)\b/.test(n)) return { categoria: "Golosinas", subcategoria: "Chocolates" };
  if (/\b(caramelo|flynn paff|media hora|butter toffee|sugus|menthoplus|halls|tic tac|pastilla|menta|chicle|beldent|bazooka|bubbaloo|big babol|topline)\b/.test(n)) return { categoria: "Golosinas", subcategoria: "Caramelos y Chicles" };
  if (/\b(alfajor|havanna|cachafaz|guaymallen|jorgito|capitán del espacio|fantoche|terrabusi|tatín|grandote|aguila alfajor)\b/.test(n)) return { categoria: "Golosinas", subcategoria: "Alfajores" };
  if (/\b(chupetin|chupetín|paleta|lollipop|corazones|mogul|gomita|goma|osito|grissly|tita|rodesia|obleas|oblea)\b/.test(n)) return { categoria: "Golosinas", subcategoria: "Golosinas varias" };
  if (/\b(turron|turrón|maní|mani|garrapiñada|peladilla|confite)\b/.test(n)) return { categoria: "Golosinas", subcategoria: "Turrones y Maní" };
  if (/\b(papa|papas|lays|pringles|pehuamar|papa frita)\b/.test(n)) return { categoria: "Snacks", subcategoria: "Papas fritas" };
  if (/\b(chizito|palito|palitos|cheetos|doritos|3d|snack|cheesetrís|cheestris|saladito|mana|conito)\b/.test(n)) return { categoria: "Snacks", subcategoria: "Snacks salados" };
  if (/\b(mani |maní |mani$|maní$|pistach|almendra|nuez|fruto seco|mix)\b/.test(n)) return { categoria: "Snacks", subcategoria: "Frutos secos" };
  if (/\b(galletita|galleta|oreo|pepitos|sonrisas|melba|traviata|criollita|express|surtido|bagley|terrabusi crackers|lincoln|rumba|tentacion|tentación|chocolinas|toddy galletita|rex|cerealita|granix)\b/.test(n)) return { categoria: "Galletitas", subcategoria: "Galletitas dulces" };
  if (/\b(crackers?|agua light|salvado|integral galletita|oblea salad)\b/.test(n)) return { categoria: "Galletitas", subcategoria: "Galletitas saladas" };
  if (/\b(aceite|girasol|oliva|maiz|maíz|cocinero|cañuelas|natura|lira|legitimo|premier|san vicente)\b/.test(n)) return { categoria: "Almacén", subcategoria: "Aceites" };
  if (/\b(harina|pureza|blancaflor|000|0000)\b/.test(n)) return { categoria: "Almacén", subcategoria: "Harinas" };
  if (/\b(arroz|gallo|lucchetti arroz|marolio arroz)\b/.test(n)) return { categoria: "Almacén", subcategoria: "Arroz" };
  if (/\b(fideos?|tallarin|spaguetti|spaghetti|mostachol|tirabuzón|tirabuzon|codito|lucchetti|matarazzo|don vicente)\b/.test(n)) return { categoria: "Almacén", subcategoria: "Pastas secas" };
  if (/\b(azúcar|azucar|ledesma|domino)\b/.test(n)) return { categoria: "Almacén", subcategoria: "Azúcar" };
  if (/\b(sal |sal$|celusal|dos anclas)\b/.test(n)) return { categoria: "Almacén", subcategoria: "Sal" };
  if (/\b(tomate|pure de|puré de|extracto|salsa|ketchup|mostaza|mayonesa|hellmann|natura salsa|savora|fanacoa)\b/.test(n)) return { categoria: "Almacén", subcategoria: "Salsas y Aderezos" };
  if (/\b(atún|atun|caballa|sardina|conserva|arveja|choclo|durazno|ananá|anana|mermelada|dulce de)\b/.test(n)) return { categoria: "Almacén", subcategoria: "Conservas y Dulces" };
  if (/\b(leche |leche$|la serenísima|sancor|ilolay|larga vida|yogur|yogurt|postre|flan)\b/.test(n)) return { categoria: "Almacén", subcategoria: "Lácteos" };
  if (/\b(polenta|premezcla|bizcochuelo|torta|repostería|reposteria|cacao|cocoa|nesquik|levadura|royal|maicena|fecula|fécula)\b/.test(n)) return { categoria: "Almacén", subcategoria: "Repostería" };
  if (/\b(vinagre|aceto|pimienta|oregano|orégano|condimento|especias|pimentón|pimenton|nuez moscada|ají|aji|comino|cúrcuma|curcuma|laurel)\b/.test(n)) return { categoria: "Almacén", subcategoria: "Condimentos" };
  if (/\b(caldo|knorr|maggi|sopa|crema de)\b/.test(n)) return { categoria: "Almacén", subcategoria: "Caldos y Sopas" };
  if (/\b(detergente|magistral|ala |cif|lavavajilla|lavandina|ayudín|ayudin|cloro|desinfectante|lysoform|procenex|limpiador|mr musculo|mr\. musculo)\b/.test(n)) return { categoria: "Limpieza", subcategoria: "Limpiadores" };
  if (/\b(jabon liquido|jabón líquido|suavizante|vivere|comfort|downy|skip|ala liquido|ace |ariel|drive|bolsa de residuo|bolsa residuo|bolsa basura|esponja|trapo|rejilla|secador|balde|escoba|trapeador)\b/.test(n)) return { categoria: "Limpieza", subcategoria: "Lavado y Hogar" };
  if (/\b(insecticida|raid|fuyi|off|repelente|cucaracha|hormiga)\b/.test(n)) return { categoria: "Limpieza", subcategoria: "Insecticidas" };
  if (/\b(shampoo|acondicionador|crema de enjuague|pantene|head.shoulder|sedal|dove|tresemmé|tresemme|suave)\b/.test(n)) return { categoria: "Higiene Personal", subcategoria: "Cabello" };
  if (/\b(jabón |jabon |jabón$|jabon$|lux|rexona barra|protex)\b/.test(n)) return { categoria: "Higiene Personal", subcategoria: "Jabones" };
  if (/\b(desodorante|rexona|axe |old spice|antitranspirante)\b/.test(n)) return { categoria: "Higiene Personal", subcategoria: "Desodorantes" };
  if (/\b(pasta dental|cepillo dental|colgate|oral-b|enjuague bucal|hilo dental|odol)\b/.test(n)) return { categoria: "Higiene Personal", subcategoria: "Higiene bucal" };
  if (/\b(pañal|pañuelo|huggies|pampers|papel higien|papel higién|higienol|elite|servilleta|rollo cocina|voligoma)\b/.test(n)) return { categoria: "Higiene Personal", subcategoria: "Papel y Pañales" };
  if (/\b(toallita|protector diario|always|kotex|nosotras|tampón|tampon)\b/.test(n)) return { categoria: "Higiene Personal", subcategoria: "Higiene femenina" };
  if (/\b(crema |protector solar|bronceador|afeitad|gillette|prestobarba|espuma de afeitar)\b/.test(n)) return { categoria: "Higiene Personal", subcategoria: "Cuidado personal" };
  if (/\b(fiambre|jamon|jamón|salame|salamin|salchich|mortadela|bondiola|queso|muzzarella|mozzarella|provolone|cremoso|sardo|rallar|fontina|barra|horma)\b/.test(n)) return { categoria: "Fiambrería", subcategoria: "Fiambres y Quesos" };
  if (/\b(hamburguesa|paty|rebozad|nugget|empanada|tapa|milanesa|congelad|medallón|medallon)\b/.test(n)) return { categoria: "Congelados", subcategoria: "Congelados" };
  if (/\b(pan |pan$|lactal|bimbo|fargo|pancito|pan dulce|budín|budin|bizcocho|magdalena|muffin|facturas|medialuna|prepizza|tostada)\b/.test(n)) return { categoria: "Panadería", subcategoria: "Panificados" };
  if (/\b(cigarrillo|marlboro|philip morris|camel|lucky strike|chesterfield|jockey|parliament|encendedor|fósforo|fosforo|bic )\b/.test(n)) return { categoria: "Kiosco", subcategoria: "Cigarrillos" };
  if (/\b(pila|duracell|energizer|batería|bateria|cargador|linterna)\b/.test(n)) return { categoria: "Kiosco", subcategoria: "Pilas y Accesorios" };
  if (/\b(actron|ibuprofeno|paracetamol|bayaspirina|aspirina|sertal|buscapina|tafirol|ibupirac|geniol|next|alikal|hepatalgina|uvasal|dioxaflex)\b/.test(n)) return { categoria: "Farmacia", subcategoria: "Medicamentos" };
  if (/\b(preservativo|prime |tulipán|tulipan|gel lubricante)\b/.test(n)) return { categoria: "Farmacia", subcategoria: "Otros farmacia" };
  if (/\b(agua oxigenada|alcohol|algodón|algodon|gasa|venda|curitas|termómetro|termometro)\b/.test(n)) return { categoria: "Farmacia", subcategoria: "Botiquín" };
  if (/\b(perro|gato|mascota|dog|cat|purina|pedigree|whiskas|eukanuba|royal canin|sabrosito|can cat)\b/.test(n)) return { categoria: "Mascotas", subcategoria: "Alimento para mascotas" };
  if (/\b(vaso|plato|cubierto|descartable|mantel|vela|servilletero|bandeja|envase|film|aluminio|bolsa zip|tupper)\b/.test(n)) return { categoria: "Bazar", subcategoria: "Descartables y Bazar" };
  return { categoria: "Otros", subcategoria: "General" };
}

/**
 * Procesa un array en chunks cediendo el hilo al navegador entre cada uno.
 */
async function processInChunks<T>(
  items: T[],
  chunkSize: number,
  processor: (item: T, index: number) => void,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    chunk.forEach((item, j) => processor(item, i + j));
    onProgress?.(Math.min(i + chunkSize, items.length), items.length);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

export default function ListaPreciosPage() {

  const [products, setProducts] = useState<Product[]>([]);
  const [preFilterIds, setPreFilterIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ids = params.get("ids");
    if (ids) setPreFilterIds(new Set(ids.split(",")));
  }, []);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState<"nombre" | "modificacion">("nombre");
  const [page, setPage] = useState(1);
  const [config, setConfig] = useState<PdfConfig>(() => {
    try {
      const saved = localStorage.getItem("listaPreciosConfig");
      if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_CONFIG;
  });
  const [showConfig, setShowConfig] = useState(false);
  const [configTab, setConfigTab] = useState<ConfigTab>("general");
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showPremiumConfig, setShowPremiumConfig] = useState(false);
  const [premiumOpts, setPremiumOpts] = useState<{
    tipoOferta: "simple" | "packUnidad";
    etiquetaBadge: string;
    mostrarBadge: boolean;
    captionModo: "auto" | "custom" | "oculto";
    captionCustom: string;
    mostrarComponentesCombo: boolean;
  }>({ tipoOferta: "packUnidad", etiquetaBadge: "OFERTA DE LA SEMANA", mostrarBadge: true, captionModo: "auto", captionCustom: "", mostrarComponentesCombo: false });
  const [listaGroupMode, setListaGroupMode] = useState<"none" | "categoria" | "subcategoria">("categoria");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoAspectRatio, setLogoAspectRatio] = useState(1); // width / height
  const [generating, setGenerating] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState<{ done: number; total: number } | null>(null);
  const itemsPerPage = 50;

  // Load logo from localStorage on mount
  // Load logo: white-label (empresa) > localStorage > hardcoded fallback
  useEffect(() => {
    const loadLogoFromUrl = (url: string) => {
      fetch(url)
        .then((r) => r.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result) {
              const src = reader.result as string;
              setLogoBase64(src);
              localStorage.setItem("listaPreciosLogo", src);
              const img = new window.Image();
              img.onload = () => { if (img.height > 0) setLogoAspectRatio(img.width / img.height); };
              img.src = src;
            }
          };
          reader.readAsDataURL(blob);
        })
        .catch(() => {});
    };

    try {
      // 1. Check localStorage cache
      const savedLogo = localStorage.getItem("listaPreciosLogo");
      if (savedLogo) {
        setLogoBase64(savedLogo);
        const img = new window.Image();
        img.onload = () => { if (img.height > 0) setLogoAspectRatio(img.width / img.height); };
        img.src = savedLogo;
      }

      // 2. Always try to refresh from white-label (empresa) config
      const wlStored = localStorage.getItem("white_label_config");
      const wlLogo = wlStored ? JSON.parse(wlStored)?.logo_url : null;
      if (wlLogo) {
        loadLogoFromUrl(wlLogo);
      } else {
        // Fetch from DB
        supabase.from("empresa").select("white_label").limit(1).single().then(({ data }) => {
          const dbLogo = (data?.white_label as any)?.logo_url;
          if (dbLogo) {
            loadLogoFromUrl(dbLogo);
          } else if (!savedLogo) {
            // 3. Fallback: hardcoded default
            loadLogoFromUrl("https://res.cloudinary.com/dss3lnovd/image/upload/v1774728837/dulcesur/Logotipo_DulceSur_2_rfwpdf.png");
          }
        });
      }
    } catch (err) { console.error("Logo load error:", err); }
  }, []);

  // Save config to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem("listaPreciosConfig", JSON.stringify(config));
    } catch (err) { console.error("Parse error:", err); }
  }, [config]);

  // Save logo to localStorage on change
  useEffect(() => {
    try {
      if (logoBase64) {
        localStorage.setItem("listaPreciosLogo", logoBase64);
      } else {
        localStorage.removeItem("listaPreciosLogo");
      }
    } catch (err) { console.error("Parse error:", err); }
  }, [logoBase64]);

  // Fetch products from Supabase
  const fetchProducts = useCallback(async () => {
    setLoading(true);

    // Fetch ALL products (Supabase limits to 1000 per query)
    async function fetchAllRows(table: string, selectStr: string, filters?: (q: any) => any) {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase.from(table).select(selectStr);
        if (filters) q = filters(q);
        const { data } = await q.range(from, from + PAGE - 1);
        const rows = (data as any[]) || [];
        all = all.concat(rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return all;
    }

    const [dbProducts, presentaciones, subcategorias] = await Promise.all([
      fetchAllRows("productos", "*, categorias(nombre), marcas(nombre)", (q: any) => q.eq("activo", true).order("nombre")),
      fetchAllRows("presentaciones", "*"),
      fetchAllRows("subcategorias", "id, nombre"),
    ]);
    const subcatMap: Record<string, string> = {};
    for (const sc of subcategorias) subcatMap[sc.id] = sc.nombre;

    const presMap = new Map<string, DBPresentacion[]>();
    presentaciones.forEach((p: DBPresentacion) => {
      const arr = presMap.get(p.producto_id) || [];
      arr.push(p);
      presMap.set(p.producto_id, arr);
    });

    const mapped: Product[] = dbProducts.map((p: DBProducto) => {
      const pres = presMap.get(p.id) || [];
      const boxPres = pres.find((pr) => pr.cantidad > 1);
      const unitPres = pres.find((pr) => pr.cantidad === 1);

      const precioUnitario = unitPres ? unitPres.precio : p.precio;
      const precioCaja = boxPres ? boxPres.precio : 0;
      const unidadesCaja = boxPres ? boxPres.cantidad : 0;
      const enOferta = unitPres ? (unitPres.precio_oferta ?? 0) > 0 : false;
      const precioOferta = unitPres?.precio_oferta ?? 0;
      const cajaEnOferta = boxPres ? (boxPres.precio_oferta ?? 0) > 0 : false;
      const precioOfertaCaja = boxPres?.precio_oferta ?? 0;

      const dbCategoria = p.categorias?.nombre || "";
      const dbMarca = p.marcas?.nombre || "";
      const clasificacion = clasificarProducto(p.nombre);

      const fechaAct = p.fecha_actualizacion || "";

      return {
        nombre: p.nombre,
        precioUnitario,
        precioCaja,
        marca: dbMarca || clasificacion.categoria,
        enOferta,
        precioOferta,
        cajaEnOferta,
        precioOfertaCaja,
        precioPorCaja: precioCaja > 0,
        unidadesCaja,
        nombrePresentacion: boxPres?.nombre || "Caja",
        nombreUnidad: unitPres?.nombre || "",
        hayStock: p.stock > 0,
        id: p.id,
        categoria: dbCategoria || "Sin categoría",
        subcategoria: (p.subcategoria_id && subcatMap[p.subcategoria_id]) || "",
        fechaActualizacion: fechaAct,
        codigo: p.codigo || "",
        precioAnterior: p.precio_anterior || 0,
        esCombo: Boolean((p as any).es_combo),
      };
    });

    setProducts(mapped);
    setLoading(false);
  }, []);

  const preSelectDone = useRef(false);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Pre-select products from URL params (from editar-precios)
  useEffect(() => {
    if (preSelectDone.current || products.length === 0) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const idsParam = params.get("ids");
      if (idsParam) {
        const ids = idsParam.split(",");
        const indices = new Set<number>();
        products.forEach((p, i) => { if (ids.includes(p.id)) indices.add(i); });
        if (indices.size > 0) {
          setSelected(indices);
          preSelectDone.current = true;
        }
      }
    } catch {}
  }, [products]);

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.categoria) c++;
    if (filters.subcategoria) c++;
    if (filters.marca) c++;
    if (filters.enOferta) c++;
    if (filters.cajaEnOferta) c++;
    if (filters.precioPorCaja) c++;
    if (filters.hayStock) c++;
    return c;
  }, [filters]);

  const marcas = useMemo(() => [...new Set(products.map((p) => p.marca).filter(Boolean))].sort(), [products]);
  const categorias = useMemo(() => [...new Set(products.map((p) => p.categoria).filter(Boolean))].sort(), [products]);
  const subcategorias = useMemo(() => {
    const prods = filters.categoria ? products.filter((p) => p.categoria === filters.categoria) : products;
    return [...new Set(prods.map((p) => p.subcategoria).filter(Boolean))].sort();
  }, [products, filters.categoria]);

  const filtered = useMemo(() => {
    const result = products.filter((p) => {
      if (preFilterIds && !preFilterIds.has(p.id)) return false;
      if (filters.search && !norm(p.nombre).includes(norm(filters.search))) return false;
      if (filters.categoria && p.categoria !== filters.categoria) return false;
      if (filters.subcategoria && p.subcategoria !== filters.subcategoria) return false;
      if (filters.marca && p.marca !== filters.marca) return false;
      if (filters.enOferta === "si" && !p.enOferta) return false;
      if (filters.enOferta === "no" && p.enOferta) return false;
      if (filters.cajaEnOferta === "si" && !p.cajaEnOferta) return false;
      if (filters.cajaEnOferta === "no" && p.cajaEnOferta) return false;
      if (filters.precioPorCaja === "si" && !p.precioPorCaja) return false;
      if (filters.precioPorCaja === "no" && p.precioPorCaja) return false;
      if (filters.hayStock === "si" && !p.hayStock) return false;
      if (filters.hayStock === "no" && p.hayStock) return false;
      if (filters.fechaDesde && p.fechaActualizacion) {
        const d = new Date(p.fechaActualizacion);
        if (!isNaN(d.getTime()) && d < new Date(filters.fechaDesde + "T00:00:00")) return false;
      }
      if (filters.fechaDesde && !p.fechaActualizacion) return false;
      if (filters.fechaHasta && p.fechaActualizacion) {
        const d = new Date(p.fechaActualizacion);
        if (!isNaN(d.getTime()) && d > new Date(filters.fechaHasta + "T23:59:59")) return false;
      }
      return true;
    });
    if (sortOrder === "modificacion") {
      result.sort((a, b) => {
        const fa = a.fechaActualizacion ? new Date(a.fechaActualizacion).getTime() : 0;
        const fb = b.fechaActualizacion ? new Date(b.fechaActualizacion).getTime() : 0;
        return fb - fa;
      });
    }
    return result;
  }, [products, filters, sortOrder, preFilterIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paginated = useMemo(() => filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage), [filtered, page]);

  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const selectAllFiltered = () => {
    const idxs = filtered.map((p) => products.indexOf(p));
    setSelected(new Set(idxs));
  };

  const deselectAllFiltered = () => setSelected(new Set());
  const clearSelection = () => setSelected(new Set());
  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(products.indexOf(p)));

  const updateConfig = <K extends keyof PdfConfig>(key: K, value: PdfConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const computeLogoAspectRatio = (src: string) => {
    const img = new window.Image();
    img.onload = () => { if (img.height > 0) setLogoAspectRatio(img.width / img.height); };
    img.src = src;
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setLogoBase64(result);
      computeLogoAspectRatio(result);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateClick = () => {
    if (selected.size > 200) {
      if (!window.confirm(
        `Vas a generar un PDF con ${selected.size} productos.\nEsto puede tardar unos segundos. ¿Continuar?`
      )) return;
    }
    setShowStylePicker(true);
  };

  // ─── PDF Generation ───
  const generatePDF = async (style: PdfStyle, premiumOverride?: typeof premiumOpts) => {
    setShowStylePicker(false);
    setGenerating(true);
    setGeneratingProgress({ done: 0, total: selected.size });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    try {
      const selectedProducts = products.filter((_, i) => selected.has(i));
      if (selectedProducts.length === 0) { setGenerating(false); return; }

      const { jsPDF } = await import("jspdf");
      const isLandscape = style === "gondola" || style === "premium";
      const pdf = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = style === "combinado" ? 4 : 5;
      // Use the most recent product update date, not today
      const latestUpdate = selectedProducts.reduce((latest, p) => {
        const d = p.fechaActualizacion ? new Date(p.fechaActualizacion).getTime() : 0;
        return d > latest ? d : latest;
      }, 0);
      const today = latestUpdate > 0
        ? new Date(latestUpdate).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
        : new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

      if (style === "combinado") {
        const cols = config.combinado_columnas;
        const rows = config.combinado_filas;
        const perPage = cols * rows;
        const cellW = (pageW - margin * 2) / cols;
        const cellH = (pageH - margin * 2) / rows;

        await processInChunks(selectedProducts, 10, (product, idx) => {
          if (idx > 0 && idx % perPage === 0) pdf.addPage();
          const posInPage = idx % perPage;
          const col = posInPage % cols;
          const row = Math.floor(posInPage / cols);
          const x = margin + col * cellW;
          const y = margin + row * cellH;
          const pad = 2.5;

          pdf.setDrawColor(200);
          pdf.setLineWidth(0.3);
          pdf.rect(x, y, cellW, cellH);

          // Layout with fixed zones anchored from bottom
          const logoSize = config.combinado_mostrarLogo && logoBase64 ? config.logoTamaño : 0;
          const bottom = y + cellH;

          const displayPrice = product.enOferta && product.precioOferta > 0 ? product.precioOferta : product.precioUnitario;
          const transferPrice = displayPrice * (1 + config.porcentajeTransferencia / 100);
          const boxPrice = product.enOferta && product.cajaEnOferta && product.precioOfertaCaja > 0 ? product.precioOfertaCaja : product.precioCaja;
          const transferBox = boxPrice * (1 + config.porcentajeTransferencia / 100);
          const hasUnits = product.unidadesCaja > 0;

          // ── BOTTOM ZONE (all positions relative to bottom) ──

          // Footer text: web (left) + date (right)
          const footerTextY = bottom - config.combinado_footerTextY;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(config.combinado_footerFontSize);
          pdf.setTextColor(150);
          if (config.combinado_mostrarWeb) pdf.text(config.webUrl, x + pad + 1, footerTextY);
          if (config.combinado_mostrarFecha) {
            const prodDate = product.fechaActualizacion
              ? new Date(product.fechaActualizacion).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
              : today;
            pdf.text(prodDate, x + cellW - pad - 1, footerTextY, { align: "right" });
          }
          pdf.setTextColor(0);

          // Footer line
          const footerLineY = bottom - config.combinado_footerLineY;
          pdf.setDrawColor(220);
          pdf.setLineWidth(0.2);
          pdf.line(x + pad, footerLineY, x + cellW - pad, footerLineY);

          // Divider line (below the big price)
          const dividerY = bottom - config.combinado_divisorY;
          pdf.setDrawColor(220);
          pdf.setLineWidth(0.2);
          pdf.line(x + pad, dividerY, x + cellW - pad, dividerY);

          // EFEC row — between divider and footer
          const efectLabelY = bottom - config.combinado_efectLabelY;
          const efectPriceY = bottom - config.combinado_efectPrecioY;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5.5);
          pdf.setTextColor(140);
          pdf.text("Efectivo", x + pad, efectLabelY);
          if (config.combinado_mostrarPrecioCaja && hasUnits && boxPrice > 0) {
            pdf.text(`${product.nombrePresentacion}`, x + cellW - pad, efectLabelY, { align: "right" });
          }
          pdf.setTextColor(0);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7);
          pdf.text(formatCurrency(displayPrice), x + pad, efectPriceY);
          if (config.combinado_mostrarPrecioCaja && hasUnits && boxPrice > 0) {
            pdf.setFontSize(6.5);
            pdf.text(formatCurrency(boxPrice), x + cellW - pad, efectPriceY, { align: "right" });
          }

          // TRANSF row
          const transfLabelY = bottom - config.combinado_transfLabelY;
          const transfPriceY = bottom - config.combinado_transfPrecioY;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5.5);
          pdf.setTextColor(140);
          pdf.text(`Transf. (${config.porcentajeTransferencia}%)`, x + pad, transfLabelY);
          if (config.combinado_mostrarPrecioCaja && hasUnits && boxPrice > 0) {
            pdf.text(`${product.nombrePresentacion}`, x + cellW - pad, transfLabelY, { align: "right" });
          }
          pdf.setTextColor(0);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7);
          pdf.setTextColor(100);
          pdf.text(formatCurrency(transferPrice), x + pad, transfPriceY);
          if (config.combinado_mostrarPrecioCaja && hasUnits && boxPrice > 0) {
            pdf.setFontSize(6.5);
            pdf.text(formatCurrency(transferBox), x + cellW - pad, transfPriceY, { align: "right" });
          }
          pdf.setTextColor(0);

          // ── TOP ZONE (flows down from top) ──

          // Logo (top-left, tight to corner) — respect aspect ratio
          if (config.combinado_mostrarLogo && logoBase64) {
            const logoW = logoSize * logoAspectRatio;
            try { pdf.addImage(logoBase64, "PNG", x + 1, y + 0.8, logoW, logoSize); } catch {}
          }

          // Marca (top-right corner)
          if (product.marca) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(5);
            pdf.setTextColor(130);
            pdf.text(product.marca.toUpperCase(), x + cellW - pad, y + pad + 3, { align: "right" });
            pdf.setTextColor(0);
          }

          // Product name — positioned at fixed offset from top (logo is in corner, name is centered)
          const topAreaEnd = y + pad + 4 + config.combinado_nombreOffset;
          const nameMaxW = cellW - pad * 2;
          let nameFontSize = config.combinado_tamañoNombre;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(nameFontSize);
          let nameLines: string[] = pdf.splitTextToSize(product.nombre, nameMaxW);
          // If more than 2 lines, shrink font until it fits in 2, min 60% of original
          const minNameFont = nameFontSize * 0.6;
          while (nameLines.length > 2 && nameFontSize > minNameFont) {
            nameFontSize -= 0.5;
            pdf.setFontSize(nameFontSize);
            nameLines = pdf.splitTextToSize(product.nombre, nameMaxW);
          }
          const nameLineH = nameFontSize * 0.45;
          const maxNameLines = Math.min(nameLines.length, 2);
          const nameY = topAreaEnd + 1;
          for (let li = 0; li < maxNameLines; li++) {
            let lineText = String(nameLines[li]);
            if (li === maxNameLines - 1 && nameLines.length > maxNameLines) {
              while (pdf.getTextWidth(lineText + "...") > nameMaxW && lineText.length > 0) {
                lineText = lineText.slice(0, -1);
              }
              lineText = lineText + "...";
            }
            pdf.text(lineText, x + cellW / 2, nameY + li * nameLineH, { align: "center" });
          }

          // Big price — centered vertically between name end and divider
          const nameEnd = nameY + maxNameLines * nameLineH;
          const priceZoneCenter = nameEnd + (dividerY - nameEnd) / 2;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.combinado_tamañoPrecio);
          pdf.text(formatCurrency(displayPrice), x + cellW / 2, priceZoneCenter + config.combinado_tamañoPrecio * 0.15, { align: "center" });
        }, (done, total) => setGeneratingProgress({ done, total }));
      }

      if (style === "duo") {
        // Same grid as combinado but with clear zones using % of cell height
        const cols = config.duo_columnas;
        const rows = config.duo_filas;
        const perPage = cols * rows;
        const cellW = (pageW - margin * 2) / cols;
        const cellH = (pageH - margin * 2) / rows;

        await processInChunks(selectedProducts, 10, (product, idx) => {
          if (idx > 0 && idx % perPage === 0) pdf.addPage();
          const posInPage = idx % perPage;
          const col = posInPage % cols;
          const row = Math.floor(posInPage / cols);
          const x = margin + col * cellW;
          const y = margin + row * cellH;
          const pad = 2.5;

          pdf.setDrawColor(200);
          pdf.setLineWidth(0.3);
          pdf.rect(x, y, cellW, cellH);

          const displayPrice = product.enOferta && product.precioOferta > 0 ? product.precioOferta : product.precioUnitario;
          const transferPrice = displayPrice * (1 + config.porcentajeTransferencia / 100);
          const boxPrice = product.enOferta && product.cajaEnOferta && product.precioOfertaCaja > 0 ? product.precioOfertaCaja : product.precioCaja;
          const transferBox = boxPrice * (1 + config.porcentajeTransferencia / 100);
          const hasUnits = product.unidadesCaja > 0 && boxPrice > 0;

          // ── ZONES as % of cellH ──
          // Top 25%: logo + marca + nombre (logo row + name row below)
          // Middle 30%: precio grande centrado
          // Lower 30%: efectivo/transf unitario (left) + caja efectivo/transf (right)
          // Bottom 15%: footer line + web + fecha
          const zPrice = y + cellH * 0.35;
          const zDetail = y + cellH * 0.58;
          const zFooter = y + cellH * 0.90;

          // ── 1. TOP: Logo + Marca + Nombre ──
          if (config.duo_mostrarLogo && logoBase64) {
            const logoSize = config.logoTamaño;
            const logoW = logoSize * logoAspectRatio;
            try { pdf.addImage(logoBase64, "PNG", x + 1, y + 0.8, logoW, logoSize); } catch {}
          }
          if (product.marca) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(5);
            pdf.setTextColor(130);
            pdf.text(product.marca.toUpperCase(), x + cellW - pad, y + pad + 3, { align: "right" });
            pdf.setTextColor(0);
          }

          // Name — starts after logo with extra space
          const logoRowH = config.duo_mostrarLogo && logoBase64 ? config.logoTamaño + 2 : 4;
          const nameMaxW = cellW - pad * 2;
          let nameFontSize = config.duo_tamañoNombre;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(nameFontSize);
          let nameLines: string[] = pdf.splitTextToSize(product.nombre, nameMaxW);
          const minNameFont = nameFontSize * 0.6;
          while (nameLines.length > 2 && nameFontSize > minNameFont) {
            nameFontSize -= 0.5;
            pdf.setFontSize(nameFontSize);
            nameLines = pdf.splitTextToSize(product.nombre, nameMaxW);
          }
          const nameLineH = nameFontSize * 0.45;
          const maxNameLines = Math.min(nameLines.length, 2);
          const nameY = y + logoRowH + 1;
          for (let li = 0; li < maxNameLines; li++) {
            let lineText = String(nameLines[li]);
            if (li === maxNameLines - 1 && nameLines.length > maxNameLines) {
              while (pdf.getTextWidth(lineText + "...") > nameMaxW && lineText.length > 0) lineText = lineText.slice(0, -1);
              lineText += "...";
            }
            pdf.text(lineText, x + cellW / 2, nameY + li * nameLineH, { align: "center" });
          }

          // ── 2. BIG PRICE (fixed position) ──
          const priceCenterY = zPrice + (zDetail - zPrice) / 2;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.duo_tamañoPrecio);
          pdf.setTextColor(0);
          pdf.text(formatCurrency(displayPrice), x + cellW / 2, priceCenterY + config.duo_tamañoPrecio * 0.13, { align: "center" });

          // ── 3. DETAIL ZONE: divider + two sides ──
          // Top divider
          pdf.setDrawColor(210);
          pdf.setLineWidth(0.2);
          pdf.line(x + pad, zDetail, x + cellW - pad, zDetail);

          const detailH = zFooter - zDetail;
          const halfW = (cellW - pad * 2) / 2;

          // LEFT: Efectivo / Transferencia (unitario)
          const leftX = x + pad;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5.5);
          pdf.setTextColor(140);
          pdf.text("Efectivo", leftX, zDetail + detailH * 0.2);
          pdf.setTextColor(0);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(8);
          pdf.text(formatCurrency(displayPrice), leftX, zDetail + detailH * 0.42);

          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5.5);
          pdf.setTextColor(140);
          pdf.text(`Transf. (${config.porcentajeTransferencia}%)`, leftX, zDetail + detailH * 0.65);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(8);
          pdf.setTextColor(100);
          pdf.text(formatCurrency(transferPrice), leftX, zDetail + detailH * 0.87);
          pdf.setTextColor(0);

          // RIGHT: Caja (if available)
          if (hasUnits) {
            const rightX = x + pad + halfW;

            // Shaded background for caja side
            pdf.setFillColor(243, 243, 243);
            pdf.rect(rightX, zDetail + 0.1, halfW, detailH - 0.2, "F");

            // Vertical divider
            pdf.setDrawColor(210);
            pdf.setLineWidth(0.15);
            pdf.line(rightX, zDetail + 1, rightX, zFooter - 1);

            const rX = rightX + 2;
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(5.5);
            pdf.setTextColor(100);
            pdf.text(`${product.nombrePresentacion}`, rX, zDetail + detailH * 0.2);
            pdf.setTextColor(0);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(8);
            pdf.text(formatCurrency(boxPrice), rX, zDetail + detailH * 0.42);

            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(5.5);
            pdf.setTextColor(140);
            pdf.text(`Transf. (${config.porcentajeTransferencia}%)`, rX, zDetail + detailH * 0.65);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(8);
            pdf.setTextColor(100);
            pdf.text(formatCurrency(transferBox), rX, zDetail + detailH * 0.87);
            pdf.setTextColor(0);
          }

          // ── 4. FOOTER ──
          pdf.setDrawColor(220);
          pdf.setLineWidth(0.2);
          pdf.line(x + pad, zFooter, x + cellW - pad, zFooter);

          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5);
          pdf.setTextColor(150);
          if (config.duo_mostrarWeb) pdf.text(config.webUrl, x + pad + 1, zFooter + 3);
          if (config.duo_mostrarFecha) {
            const prodDate = product.fechaActualizacion
              ? new Date(product.fechaActualizacion).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
              : today;
            pdf.text(prodDate, x + cellW - pad - 1, zFooter + 3, { align: "right" });
          }
          pdf.setTextColor(0);
        }, (done, total) => setGeneratingProgress({ done, total }));
      }

      if (style === "simple") {
        // Same as duo but bottom zone only shows caja/bulto/display + price (no efectivo/transf)
        const cols = config.duo_columnas;
        const rows = config.duo_filas;
        const perPage = cols * rows;
        const cellW = (pageW - margin * 2) / cols;
        const cellH = (pageH - margin * 2) / rows;

        await processInChunks(selectedProducts, 10, (product, idx) => {
          if (idx > 0 && idx % perPage === 0) pdf.addPage();
          const posInPage = idx % perPage;
          const col = posInPage % cols;
          const row = Math.floor(posInPage / cols);
          const x = margin + col * cellW;
          const y = margin + row * cellH;
          const pad = 2.5;

          pdf.setDrawColor(200);
          pdf.setLineWidth(0.3);
          pdf.rect(x, y, cellW, cellH);

          const displayPrice = product.enOferta && product.precioOferta > 0 ? product.precioOferta : product.precioUnitario;
          const boxPrice = product.enOferta && product.cajaEnOferta && product.precioOfertaCaja > 0 ? product.precioOfertaCaja : product.precioCaja;
          const hasUnits = product.unidadesCaja > 0 && boxPrice > 0;

          // Zones
          const zPrice = y + cellH * 0.35;
          const zDetail = y + cellH * 0.58;
          const zFooter = y + cellH * 0.90;

          // ── 1. TOP: Logo + Marca + Nombre ──
          if (config.duo_mostrarLogo && logoBase64) {
            const logoSize = config.logoTamaño;
            const logoW = logoSize * logoAspectRatio;
            try { pdf.addImage(logoBase64, "PNG", x + 1, y + 0.8, logoW, logoSize); } catch {}
          }
          if (product.marca) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(5);
            pdf.setTextColor(130);
            pdf.text(product.marca.toUpperCase(), x + cellW - pad, y + pad + 3, { align: "right" });
            pdf.setTextColor(0);
          }

          const logoRowH = config.duo_mostrarLogo && logoBase64 ? config.logoTamaño + 2 : 4;
          const nameMaxW = cellW - pad * 2;
          let nameFontSize = config.duo_tamañoNombre;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(nameFontSize);
          let nameLines: string[] = pdf.splitTextToSize(product.nombre, nameMaxW);
          const minNameFont = nameFontSize * 0.6;
          while (nameLines.length > 2 && nameFontSize > minNameFont) {
            nameFontSize -= 0.5;
            pdf.setFontSize(nameFontSize);
            nameLines = pdf.splitTextToSize(product.nombre, nameMaxW);
          }
          const nameLineH = nameFontSize * 0.45;
          const maxNameLines = Math.min(nameLines.length, 2);
          const nameY = y + logoRowH + 1;
          for (let li = 0; li < maxNameLines; li++) {
            let lineText = String(nameLines[li]);
            if (li === maxNameLines - 1 && nameLines.length > maxNameLines) {
              while (pdf.getTextWidth(lineText + "...") > nameMaxW && lineText.length > 0) lineText = lineText.slice(0, -1);
              lineText += "...";
            }
            pdf.text(lineText, x + cellW / 2, nameY + li * nameLineH, { align: "center" });
          }

          // ── 2. BIG PRICE (fixed position) ──
          const priceCenterY = zPrice + (zDetail - zPrice) / 2;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.duo_tamañoPrecio);
          pdf.setTextColor(0);
          pdf.text(formatCurrency(displayPrice), x + cellW / 2, priceCenterY + config.duo_tamañoPrecio * 0.13, { align: "center" });

          // ── 3. CAJA SECTION (simple: just label + price, centered) ──
          pdf.setDrawColor(210);
          pdf.setLineWidth(0.2);
          pdf.line(x + pad, zDetail, x + cellW - pad, zDetail);

          const detailH = zFooter - zDetail;

          if (hasUnits) {
            // Shaded background
            pdf.setFillColor(243, 243, 243);
            pdf.rect(x + 0.15, zDetail + 0.1, cellW - 0.3, detailH - 0.2, "F");

            // Presentación label (left, uses real name from DB)
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(11);
            pdf.setTextColor(60);
            pdf.text(`${product.nombrePresentacion}`, x + pad + 1, zDetail + detailH * 0.55);

            // Box price (right, big)
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(18);
            pdf.setTextColor(0);
            pdf.text(formatCurrency(boxPrice), x + cellW - pad - 1, zDetail + detailH * 0.6, { align: "right" });
          }

          // ── 4. FOOTER ──
          pdf.setDrawColor(220);
          pdf.setLineWidth(0.2);
          pdf.line(x + pad, zFooter, x + cellW - pad, zFooter);

          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5);
          pdf.setTextColor(150);
          if (config.duo_mostrarWeb) pdf.text(config.webUrl, x + pad + 1, zFooter + 3);
          if (config.duo_mostrarFecha) {
            const prodDate = product.fechaActualizacion
              ? new Date(product.fechaActualizacion).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
              : today;
            pdf.text(prodDate, x + cellW - pad - 1, zFooter + 3, { align: "right" });
          }
          pdf.setTextColor(0);
        }, (done, total) => setGeneratingProgress({ done, total }));
      }

      if (style === "premium") {
        // ── Cartel "Premium" A4 horizontal — pensado para impresión en B&N ──
        const opts = premiumOverride ?? premiumOpts;
        // QR por producto: lleva a la URL del producto en la tienda online.
        const qrMap: Record<string, string> = {};
        if (config.webUrl) {
          try {
            const QRCode = (await import("qrcode")).default;
            const base = (config.webUrl.startsWith("http") ? config.webUrl : `https://${config.webUrl}`).replace(/\/$/, "");
            await Promise.all(selectedProducts.map(async (p) => {
              const productUrl = `${base}/productos/${productSlug(p.nombre, p.id)}`;
              try {
                qrMap[p.id] = await QRCode.toDataURL(productUrl, { width: 300, margin: 0, color: { dark: "#000000", light: "#ffffff" } });
              } catch {}
            }));
          } catch {}
        }

        // Pre-fetch combo_items para todos los combos seleccionados
        // combo_items.cantidad = unidades directas del combo (no cajas internas).
        const comboIds = selectedProducts.filter((p) => p.esCombo).map((p) => p.id);
        const combosMap: Record<string, { producto_id: string; nombre: string; cantidad: number }[]> = {};
        if (comboIds.length > 0) {
          const { data: items } = await supabase
            .from("combo_items")
            .select("combo_id, producto_id, cantidad, productos!combo_items_producto_id_fkey(nombre)")
            .in("combo_id", comboIds);
          (items || []).forEach((it: any) => {
            if (!combosMap[it.combo_id]) combosMap[it.combo_id] = [];
            combosMap[it.combo_id].push({
              producto_id: it.producto_id,
              nombre: it.productos?.nombre || "",
              cantidad: it.cantidad,
            });
          });
        }

        // Helper: parte un currency "$14.500,00" en { symbol, integer, decimals }
        const splitPrice = (n: number) => {
          const full = formatCurrency(n, true); // "$14.500,00"
          const m = full.match(/^([^\d]*)([\d\.]+)(,\d{2})?$/);
          return {
            symbol: (m?.[1] ?? "$").trim() || "$",
            integer: m?.[2] ?? String(Math.round(n)),
            decimals: m?.[3] ?? ",00",
          };
        };
        // Conversión pt → mm (jsPDF pages son mm, pero font sizes van en pt)
        const PT_TO_MM = 0.3528;
        const CAP_FACTOR = 0.72; // cap height ≈ 72% del font size

        // Parse sufijo "Caja xN Un" / "Caja x N unidades" del nombre cuando no hay caja cargada.
        // Algunos productos tienen la info de caja en el titulo en lugar de en presentaciones.
        const cajaSuffixRe = /\s+caja\s*x\s*(\d+)\s*(un|unid|unidades?|u)?\.?$/i;

        await processInChunks(selectedProducts, 10, (product, idx) => {
          if (idx > 0) pdf.addPage();
          const displayPriceRaw = product.enOferta && product.precioOferta > 0 ? product.precioOferta : product.precioUnitario;
          let boxPriceRaw = product.enOferta && product.cajaEnOferta && product.precioOfertaCaja > 0 ? product.precioOfertaCaja : product.precioCaja;
          let unidadesCaja = product.unidadesCaja;
          let displayName = product.nombre;
          // Si el producto no tiene caja cargada pero el nombre tiene "Caja xN Un", extraer.
          if (!product.esCombo && (unidadesCaja === 0 || boxPriceRaw === 0)) {
            const m = product.nombre.match(cajaSuffixRe);
            if (m) {
              const n = parseInt(m[1], 10);
              if (n > 1) {
                displayName = product.nombre.replace(cajaSuffixRe, "").trim();
                unidadesCaja = n;
                boxPriceRaw = displayPriceRaw;
              }
            }
          }
          const displayPrice = displayPriceRaw;
          const hasUnits = unidadesCaja > 0 && boxPriceRaw > 0;
          const comboItems = product.esCombo ? (combosMap[product.id] || []) : [];
          // comboTotalProductos = cantidad de componentes distintos (ej: 4 sabores)
          // comboTotalUnidades = suma de cantidades (ej: 6+6+6+6 = 24 unidades)
          const comboTotalProductos = comboItems.length;
          const comboTotalUnidades = comboItems.reduce((s, i) => s + i.cantidad, 0);
          const showPackUnidad = opts.tipoOferta === "packUnidad" && (hasUnits || (product.esCombo && comboTotalUnidades > 0));
          const mainPrice = product.esCombo
            ? displayPrice
            : (showPackUnidad ? boxPriceRaw : displayPrice);
          // Precio unitario para el bloque "PRECIO POR UNIDAD":
          // - Combo: precio total / TOTAL de unidades (contando cajas internas de cada componente)
          // - Producto con caja: precioCaja / unidadesCaja
          const unitPriceReal = product.esCombo
            ? (comboTotalUnidades > 0 ? mainPrice / comboTotalUnidades : 0)
            : (hasUnits ? boxPriceRaw / unidadesCaja : displayPrice);

          // Márgenes generosos
          const lm = 20;
          const rm = pageW - 20;
          const tm = 18;
          const bm = pageH - 18;

          // ─── TOP ROW: Logo izquierda + Badge derecha ───
          if (config.premium_mostrarLogo && logoBase64) {
            const logoH = config.premium_logoTamaño;
            const logoW = logoH * logoAspectRatio;
            try { pdf.addImage(logoBase64, "PNG", lm, tm, logoW, logoH); } catch {}
          }

          if (opts.mostrarBadge && opts.etiquetaBadge.trim()) {
            const badgeText = opts.etiquetaBadge.trim().toUpperCase();
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(10);
            const badgeTextW = pdf.getTextWidth(badgeText);
            const padX = 7;
            const dotR = 1.4;
            const dotGap = 3;
            const badgeH = 9;
            const badgeW = badgeTextW + padX * 2 + dotR * 2 + dotGap;
            const badgeX = rm - badgeW;
            const badgeY = tm + 2;
            pdf.setFillColor(20, 20, 20);
            pdf.roundedRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2, badgeH / 2, "F");
            // Dot (gris claro — visible en B&N)
            pdf.setFillColor(200, 200, 200);
            pdf.circle(badgeX + padX - 2, badgeY + badgeH / 2, dotR, "F");
            pdf.setTextColor(255);
            pdf.text(badgeText, badgeX + padX + dotR * 2 + dotGap - 2, badgeY + badgeH / 2 + 1.2);
            pdf.setTextColor(0);
          }

          // ─── CAPTION (PASCUAS · STOCK LIMITADO tipo) ───
          let cursorY = tm + 32;
          let caption = "";
          if (opts.captionModo === "custom") caption = opts.captionCustom.trim();
          else if (opts.captionModo === "auto") {
            const parts: string[] = [];
            if (product.marca) parts.push(product.marca);
            if (product.categoria) parts.push(product.categoria);
            caption = parts.join(" · ");
          }
          if (caption) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(config.premium_tamañoCaption);
            pdf.setCharSpace(1.2);
            pdf.setTextColor(120);
            pdf.text(caption.toUpperCase(), lm, cursorY);
            pdf.setCharSpace(0);
            pdf.setTextColor(0);
            cursorY += 6;
          }

          // ─── PRODUCT NAME (grande, bold) ───
          pdf.setFont("helvetica", "bold");
          const maxNameW = rm - lm;
          // Auto-shrink si es muy largo — empieza en tamaño configurado, baja si no entra
          let nameSize = config.premium_tamañoNombre;
          while (nameSize > 20) {
            pdf.setFontSize(nameSize);
            const testLines = pdf.splitTextToSize(displayName, maxNameW);
            const tooWide = testLines.some((l: string) => pdf.getTextWidth(l) > maxNameW + 0.5);
            if (testLines.length <= 2 && !tooWide) break;
            nameSize -= 3;
          }
          pdf.setFontSize(nameSize);
          const nameLines: string[] = pdf.splitTextToSize(displayName, maxNameW).slice(0, 2);
          const nameLH = nameSize * 0.38;
          nameLines.forEach((line: string, i: number) => {
            pdf.text(line, lm, cursorY + nameLH + i * nameLH);
          });
          cursorY += nameLines.length * nameLH + 4;

          // ─── SUBTITLE PRESENTACIÓN ───
          // Combo: "Combo · N productos · M unidades"
          // Caja:  "Caja x N unidades — $X c/u"  (info unificada, sin "LA CAJA" arriba del precio)
          // Unidad sola: nombrePresentacion si no es generico
          const GENERIC_UNIT = /^(unidad(es)?|u|un\.?|pieza|item|gen[eé]rico)$/i;
          let subtitle = "";
          if (product.esCombo) {
            if (comboTotalUnidades > 0 && comboTotalProductos !== comboTotalUnidades) {
              subtitle = `Combo · ${comboTotalProductos} productos · ${comboTotalUnidades} unidades totales`;
            } else if (comboTotalUnidades > 0) {
              subtitle = `Combo x ${comboTotalUnidades} unidades`;
            } else {
              subtitle = "Combo";
            }
          } else if (hasUnits) {
            subtitle = `Caja x ${unidadesCaja} unidades`;
          } else {
            const np = (product.nombrePresentacion || "").trim();
            const nu = (product.nombreUnidad || "").trim();
            const candidate = np || nu;
            // Filtrar labels genericos ("Unidad", "Un", etc.)
            subtitle = candidate && !GENERIC_UNIT.test(candidate) ? candidate : "";
          }
          if (subtitle) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(config.premium_tamañoSubtitulo);
            pdf.setTextColor(110);
            pdf.text(subtitle, lm, cursorY + 6);
            pdf.setTextColor(0);
            cursorY += 14;
          }

          // ─── COMPONENTES DEL COMBO (opcional) ───
          if (product.esCombo && opts.mostrarComponentesCombo && comboItems.length > 0) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(10);
            pdf.setTextColor(90);
            let compY = cursorY;
            comboItems.slice(0, 8).forEach((c) => {
              // Ej: "· 6× Papas Slices Ketchup 65g"  o  "· Alfajor Triple"
              const line = `· ${c.cantidad > 1 ? c.cantidad + "× " : ""}${c.nombre}`;
              const lines = pdf.splitTextToSize(line, (rm - lm) / 2);
              lines.forEach((ln: string) => {
                pdf.text(ln, lm, compY);
                compY += 4;
              });
            });
            pdf.setTextColor(0);
            cursorY = compY + 2;
          }

          // ─── PRECIO (negro sobre blanco, tipográfico — todo en una sola línea) ───
          const priceParts = splitPrice(mainPrice);
          const priceSize = config.premium_tamañoPrecio;
          const priceCapMM = priceSize * PT_TO_MM * CAP_FACTOR;
          // priceY = baseline del número principal. Reservamos priceCapMM de altura arriba + margen.
          const priceY = cursorY + priceCapMM + 8;

          // (Sin etiqueta arriba del precio: redundante con el subtitulo que ya dice "Caja x N" o "Combo · ...")

          // Tamaños auxiliares
          const symSize = priceSize * 0.45;
          const decSize = priceSize * 0.36;
          const symCapMM = symSize * PT_TO_MM * CAP_FACTOR;
          const decCapMM = decSize * PT_TO_MM * CAP_FACTOR;

          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(0);

          // Medir anchos (cambiar font antes de medir)
          pdf.setFontSize(symSize);
          const symW = pdf.getTextWidth(priceParts.symbol);
          pdf.setFontSize(priceSize);
          const numW = pdf.getTextWidth(priceParts.integer);
          pdf.setFontSize(decSize);
          const decW = pdf.getTextWidth(priceParts.decimals);

          const gapAfterSym = 2;
          const gapAfterNum = 1;

          // Dibujar: "$" baseline alineado al top del número; decimales igual
          pdf.setFontSize(symSize);
          pdf.text(priceParts.symbol, lm, priceY - (priceCapMM - symCapMM));
          pdf.setFontSize(priceSize);
          pdf.text(priceParts.integer, lm + symW + gapAfterSym, priceY);
          pdf.setFontSize(decSize);
          pdf.text(priceParts.decimals, lm + symW + gapAfterSym + numW + gapAfterNum, priceY - (priceCapMM - decCapMM));

          const totalPriceW = symW + gapAfterSym + numW + gapAfterNum + decW;

          // ─── PRECIO POR UNIDAD (si packUnidad o combo con componentes) ───
          const showUnitBlock = (showPackUnidad && !product.esCombo) ||
                                (product.esCombo && comboTotalUnidades > 0 && opts.tipoOferta === "packUnidad");
          if (showUnitBlock) {
            const pxuX = lm + totalPriceW + 16;
            // Alineado con el top del precio principal
            const pxuLabelY = priceY - priceCapMM + 2;
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(9);
            pdf.setCharSpace(1.2);
            pdf.setTextColor(130);
            pdf.text("PRECIO POR UNIDAD", pxuX, pxuLabelY);
            pdf.setCharSpace(0);
            pdf.setTextColor(0);

            // Precio unidad (con decimales si no es redondo)
            const unitSize = config.premium_tamañoPrecioUnidad;
            const unitRoundedEquals = Math.round(unitPriceReal) === unitPriceReal;
            const unitStr = formatCurrency(unitPriceReal, !unitRoundedEquals);
            const cuSize = unitSize * 0.45;

            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(unitSize);
            // Medir al tamaño grande ANTES de cambiar
            const unitW = pdf.getTextWidth(unitStr);
            const unitBaseline = pxuLabelY + unitSize * PT_TO_MM * CAP_FACTOR + 4;
            pdf.text(unitStr, pxuX, unitBaseline);

            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(cuSize);
            pdf.setTextColor(130);
            pdf.text("c/u", pxuX + unitW + 2, unitBaseline);
            pdf.setTextColor(0);
          }

          // ─── DIVIDER + FOOTER ───
          const qrDataUrl = qrMap[product.id];
          const dividerY = bm - 26;
          pdf.setDrawColor(210);
          pdf.setLineWidth(0.3);
          pdf.line(lm, dividerY, rm, dividerY);

          // Left: texto + URL (el QR ya lleva al producto puntual)
          if (config.premium_mostrarWeb) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(9.5);
            pdf.setTextColor(110);
            pdf.text("Mirá este producto en nuestra tienda online", lm, dividerY + 9);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(14);
            pdf.setTextColor(0);
            pdf.text(config.webUrl, lm, dividerY + 17);
          }

          // Right: QR específico del producto + caption horizontal abajo
          if (qrDataUrl) {
            const qrSize = 24;
            const qrX = rm - qrSize;
            const qrY = dividerY + 1;
            try { pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize); } catch {}
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(7);
            pdf.setCharSpace(0.3);
            pdf.setTextColor(130);
            pdf.text("Escaneá para ver este producto", qrX + qrSize / 2, qrY + qrSize + 3.5, { align: "center" });
            pdf.setCharSpace(0);
            pdf.setTextColor(0);
          }

          // ─── CROP MARKS (esquinas sutiles) ───
          const cmLen = 3;
          const cmOff = 4;
          pdf.setDrawColor(180);
          pdf.setLineWidth(0.2);
          // Top-left
          pdf.line(lm - cmOff, tm, lm - cmOff + cmLen, tm);
          pdf.line(lm - cmOff, tm, lm - cmOff, tm + cmLen);
          // Top-right
          pdf.line(rm + cmOff, tm, rm + cmOff - cmLen, tm);
          pdf.line(rm + cmOff, tm, rm + cmOff, tm + cmLen);
          // Bottom-left
          pdf.line(lm - cmOff, bm, lm - cmOff + cmLen, bm);
          pdf.line(lm - cmOff, bm, lm - cmOff, bm - cmLen);
          // Bottom-right
          pdf.line(rm + cmOff, bm, rm + cmOff - cmLen, bm);
          pdf.line(rm + cmOff, bm, rm + cmOff, bm - cmLen);
        }, (done, total) => setGeneratingProgress({ done, total }));
      }

      if (style === "lista") {
        // ── Lista General de Precios — Diseño limpio ──
        const empresaNombre = "DULCESUR";
        const lm = 10;
        const rm = pageW - 10;
        const colW = rm - lm;
        const fmtP = (n: number) => `$${n.toLocaleString("es-AR")}`;
        const rowH = 5.5;
        const totalPages = { count: 1 };
        let globalRowIdx = 0;

        // Column positions (right-aligned prices) — spread evenly across available width
        const colUnidad = rm - 80;
        const colCaja = rm - 40;
        const colFecha = rm - 2;

        const drawPageFooter = (pageNum: number) => {
          const footY = pageH - 8;
          pdf.setDrawColor(220);
          pdf.setLineWidth(0.2);
          pdf.line(lm, footY, rm, footY);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(6.5);
          pdf.setTextColor(150);
          pdf.text(config.webUrl || "www.dulcesur.com", lm, footY + 3.5);
          pdf.text(`Pág. ${pageNum}`, rm, footY + 3.5, { align: "right" });
          pdf.setTextColor(0);
        };

        const drawHeader = (isFirstPage: boolean) => {
          if (isFirstPage) {
            // Logo — respect aspect ratio
            const logoH = logoBase64 ? 12 : 0;
            const logoW = logoBase64 ? logoH * logoAspectRatio : 0;
            if (logoBase64) { try { pdf.addImage(logoBase64, "PNG", lm, 8, logoW, logoH); } catch {} }

            // Title + info right-aligned to logo
            const titleX = logoBase64 ? lm + logoW + 4 : lm;
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(16);
            pdf.setTextColor(30);
            pdf.text("Lista de Precios", titleX, 14);

            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(9);
            pdf.setTextColor(80);
            pdf.text(`${empresaNombre}  ·  ${today}  ·  ${selectedProducts.length} productos`, titleX, 19.5);
            pdf.setTextColor(0);

            // Separator
            pdf.setDrawColor(80);
            pdf.setLineWidth(0.4);
            pdf.line(lm, 24, rm, 24);

            return 28;
          } else {
            // Continuation pages
            if (logoBase64) {
              const lH = 5;
              const lW = lH * logoAspectRatio;
              try { pdf.addImage(logoBase64, "PNG", lm, 4, lW, lH); } catch {}
            }
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(7);
            pdf.setTextColor(120);
            const contX = logoBase64 ? lm + 5 * logoAspectRatio + 3 : lm;
            pdf.text(`${empresaNombre} — Lista de Precios`, contX, 7.5);
            pdf.setTextColor(0);
            pdf.setDrawColor(200);
            pdf.setLineWidth(0.2);
            pdf.line(lm, 10, rm, 10);
            return 13;
          }
        };

        const drawTableHeader = (y: number) => {
          pdf.setFillColor(50, 50, 55);
          pdf.rect(lm, y, colW, 6, "F");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(6.5);
          pdf.setTextColor(255);
          const ty = y + 4;
          pdf.text("PRODUCTO", lm + 3, ty);
          pdf.text("UNIDAD", colUnidad, ty, { align: "right" });
          pdf.text("CAJA (cant.)", colCaja + 8, ty, { align: "right" });
          pdf.text("ULT. MODIF.", colFecha, ty, { align: "right" });
          pdf.setTextColor(0);
          return y + 7.5;
        };

        const drawCategoryHeader = (cat: string, y: number) => {
          pdf.setFillColor(50, 50, 55);
          pdf.rect(lm, y, colW, 6.5, "F");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7.5);
          pdf.setTextColor(255);
          pdf.text(cat.toUpperCase(), lm + 3, y + 4.5);
          // Column headers on category row
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5.5);
          pdf.setTextColor(200);
          pdf.text("UNIDAD", colUnidad, y + 4.5, { align: "right" });
          pdf.text("CAJA (cant.)", colCaja + 8, y + 4.5, { align: "right" });
          pdf.text("ULT. MODIF.", colFecha, y + 4.5, { align: "right" });
          pdf.setTextColor(0);
          return y + 8;
        };

        const drawSubcategoryHeader = (sub: string, y: number) => {
          pdf.setFillColor(240, 240, 240);
          pdf.rect(lm, y, colW, 5.5, "F");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(6.5);
          pdf.setTextColor(80);
          pdf.text(sub, lm + 5, y + 3.8);
          pdf.setTextColor(0);
          return y + 6.5;
        };

        const drawProduct = (p: Product, y: number) => {
          // Alternating rows: white / very light gray
          if (globalRowIdx % 2 === 1) {
            pdf.setFillColor(247, 247, 247);
            pdf.rect(lm, y, colW, rowH, "F");
          }

          const unitPrice = p.enOferta && p.precioOferta > 0 ? p.precioOferta : p.precioUnitario;
          const boxPrice = p.precioCaja > 0 ? p.precioCaja : 0;
          const boxQty = p.unidadesCaja > 0 ? p.unidadesCaja : 0;
          const fechaAct = p.fechaActualizacion ? new Date(p.fechaActualizacion).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "";
          const textY = y + 3.5;

          // Product name
          const nombre = p.nombre.length > 50 ? p.nombre.substring(0, 47) + "..." : p.nombre;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(7);
          pdf.setTextColor(30);
          pdf.text(nombre, lm + 3, textY);

          // Brand next to name in gray
          if (p.marca) {
            const nameW = pdf.getTextWidth(nombre);
            pdf.setFontSize(5.5);
            pdf.setTextColor(160);
            pdf.text(p.marca, lm + 4 + nameW, textY);
          }

          // Unit price (bold)
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7.5);
          pdf.setTextColor(30);
          pdf.text(fmtP(unitPrice), colUnidad, textY, { align: "right" });

          // Box price + quantity
          if (boxPrice > 0) {
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(7);
            pdf.setTextColor(30);
            const boxText = `${fmtP(boxPrice)}`;
            pdf.text(boxText, colCaja, textY, { align: "right" });
            // Quantity in parentheses
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(6);
            pdf.setTextColor(120);
            pdf.text(`(${boxQty} un.)`, colCaja + 1, textY);
          } else {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(6.5);
            pdf.setTextColor(190);
            pdf.text("—", colCaja - 3, textY);
          }

          // Date
          if (fechaAct) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(6);
            pdf.setTextColor(150);
            pdf.text(fechaAct, colFecha, textY, { align: "right" });
          }

          pdf.setTextColor(0);
          // Subtle bottom line
          pdf.setDrawColor(235);
          pdf.setLineWidth(0.1);
          pdf.line(lm + 2, y + rowH, rm - 2, y + rowH);

          globalRowIdx++;
          return y + rowH;
        };

        const checkPage = (y: number, needed: number = rowH): number => {
          if (y + needed > pageH - 13) {
            drawPageFooter(totalPages.count);
            pdf.addPage();
            totalPages.count++;
            const startY = drawHeader(false);
            return startY;
          }
          return y;
        };

        // ── Render ──
        let yPos = drawHeader(true);

        if (listaGroupMode === "none") {
          yPos = drawTableHeader(yPos);
          await processInChunks(selectedProducts, 10, (p) => {
            yPos = checkPage(yPos);
            yPos = drawProduct(p, yPos);
          }, (done, total) => setGeneratingProgress({ done, total }));
        } else if (listaGroupMode === "categoria") {
          const groups: Record<string, Product[]> = {};
          selectedProducts.forEach((p) => {
            const cat = p.categoria || "Sin categoría";
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(p);
          });
          Object.keys(groups).sort().forEach((cat) => {
            yPos = checkPage(yPos, 15);
            globalRowIdx = 0;
            yPos = drawCategoryHeader(cat, yPos);
            groups[cat].forEach((p) => {
              yPos = checkPage(yPos);
              yPos = drawProduct(p, yPos);
            });
            yPos += 2;
          });
        } else {
          const groups: Record<string, Record<string, Product[]>> = {};
          selectedProducts.forEach((p) => {
            const cat = p.categoria || "Sin categoría";
            const sub = p.subcategoria || "General";
            if (!groups[cat]) groups[cat] = {};
            if (!groups[cat][sub]) groups[cat][sub] = [];
            groups[cat][sub].push(p);
          });
          Object.keys(groups).sort().forEach((cat) => {
            yPos = checkPage(yPos, 20);
            globalRowIdx = 0;
            yPos = drawCategoryHeader(cat, yPos);
            Object.keys(groups[cat]).sort().forEach((sub) => {
              yPos = checkPage(yPos, 12);
              yPos = drawSubcategoryHeader(sub, yPos);
              groups[cat][sub].forEach((p) => {
                yPos = checkPage(yPos);
                yPos = drawProduct(p, yPos);
              });
              yPos += 1.5;
            });
            yPos += 2;
          });
        }

        // Footer on last page
        drawPageFooter(totalPages.count);
      }

      if (style === "variaciones") {
        // Generate variations PDF — landscape with price history
        const vPdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const vpw = vPdf.internal.pageSize.getWidth();
        const vm = 10;
        let vy = 18;
        const fmtP2 = formatCurrency;

        // Header
        vPdf.setFontSize(14);
        vPdf.setFont("helvetica", "bold");
        vPdf.text("Lista de Precios Actualizados", vm, vy);
        vy += 5;
        vPdf.setFontSize(8);
        vPdf.setFont("helvetica", "normal");
        vPdf.setTextColor(120);
        vPdf.text(`Fecha: ${today} — ${selectedProducts.length} productos`, vm, vy);
        vPdf.setTextColor(0);
        vy += 7;

        // Table header
        vPdf.setFillColor(240, 240, 240);
        vPdf.rect(vm, vy - 4, vpw - vm * 2, 6, "F");
        vPdf.setFontSize(7);
        vPdf.setFont("helvetica", "bold");
        vPdf.text("Código", vm + 2, vy);
        vPdf.text("Producto", vm + 32, vy);
        vPdf.text("Marca", vm + 100, vy);
        vPdf.text("Categoría", vm + 130, vy);
        vPdf.text("Subcat.", vm + 160, vy);
        vPdf.text("Anterior", vpw - vm - 55, vy, { align: "right" });
        vPdf.text("Nuevo", vpw - vm - 25, vy, { align: "right" });
        vPdf.text("Var.", vpw - vm, vy, { align: "right" });
        vy += 5;

        // Rows
        vPdf.setFont("helvetica", "normal");
        for (const p of selectedProducts) {
          if (vy > 195) { vPdf.addPage(); vy = 15; }
          vPdf.setFontSize(7);
          vPdf.text((p.codigo || "—").substring(0, 16), vm + 2, vy);
          vPdf.text(p.nombre.substring(0, 35), vm + 32, vy);
          vPdf.setTextColor(100);
          vPdf.text((p.marca || "—").substring(0, 15), vm + 100, vy);
          vPdf.text((p.categoria || "—").substring(0, 15), vm + 130, vy);
          vPdf.text((p.subcategoria || "—").substring(0, 15), vm + 160, vy);
          vPdf.setTextColor(0);
          const anterior = p.precioAnterior || p.precioUnitario;
          const nuevo = p.precioUnitario;
          if (anterior !== nuevo) {
            vPdf.setTextColor(150);
            vPdf.text(fmtP2(anterior), vpw - vm - 55, vy, { align: "right" });
            vPdf.setTextColor(0);
          } else {
            vPdf.text("—", vpw - vm - 55, vy, { align: "right" });
          }
          vPdf.setFont("helvetica", "bold");
          vPdf.text(fmtP2(nuevo), vpw - vm - 25, vy, { align: "right" });
          vPdf.setFont("helvetica", "normal");
          if (anterior > 0 && anterior !== nuevo) {
            const pct = Math.round(((nuevo - anterior) / anterior) * 100);
            vPdf.setTextColor(pct > 0 ? 220 : 0, pct > 0 ? 50 : 150, pct > 0 ? 50 : 0);
            vPdf.text(`${pct > 0 ? "+" : ""}${pct}%`, vpw - vm, vy, { align: "right" });
            vPdf.setTextColor(0);
          } else {
            vPdf.text("—", vpw - vm, vy, { align: "right" });
          }
          vy += 4.5;
          vPdf.setDrawColor(230);
          vPdf.line(vm, vy - 2, vpw - vm, vy - 2);
        }

        const vBlob = vPdf.output("blob");
        const vUrl = URL.createObjectURL(vBlob);
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(vUrl);
        setShowPreview(true);
        return;
      }

      if (style === "gondola") {
        // Landscape A4: 297×210mm — 3 cols x 5 rows = 15 labels per page
        const cols = 3;
        const rows = 5;
        const perPage = cols * rows;
        const cellW = (pageW - margin * 2) / cols;  // ~96mm
        const cellH = (pageH - margin * 2) / rows;  // ~40mm
        const pad = 3;

        await processInChunks(selectedProducts, 10, (product, idx) => {
          if (idx > 0 && idx % perPage === 0) pdf.addPage();
          const posInPage = idx % perPage;
          const col = posInPage % cols;
          const row = Math.floor(posInPage / cols);
          const x = margin + col * cellW;
          const y = margin + row * cellH;
          const centerX = x + cellW / 2;

          const displayPrice = product.enOferta && product.precioOferta > 0 ? product.precioOferta : product.precioUnitario;
          const boxPrice = product.enOferta && product.cajaEnOferta && product.precioOfertaCaja > 0 ? product.precioOfertaCaja : product.precioCaja;
          const hasBox = product.unidadesCaja > 0 && boxPrice > 0;

          // ── Cell border (dashed cut lines) ──
          pdf.setDrawColor(170);
          pdf.setLineWidth(0.2);
          pdf.setLineDashPattern([2, 2], 0);
          pdf.rect(x, y, cellW, cellH);
          pdf.setLineDashPattern([], 0);

          // ── Fixed zones ──
          const headerH = 7;
          const footerH = 4;
          const headerBottom = y + headerH;
          const footerTop = y + cellH - footerH;
          const contentTop = headerBottom + 1;
          const contentH = footerTop - contentTop - 0.5;

          // ── HEADER: logo left, web right ──
          if (logoBase64) {
            const lH = headerH - 1;
            const lW = lH * logoAspectRatio;
            try { pdf.addImage(logoBase64, "PNG", x + pad, y + 0.5, lW, lH); } catch {}
          }
          if (config.webUrl) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(7);
            pdf.setTextColor(100);
            pdf.text(config.webUrl, x + cellW - pad, y + headerH * 0.6, { align: "right" });
            pdf.setTextColor(0);
          }
          pdf.setDrawColor(210);
          pdf.setLineWidth(0.15);
          pdf.line(x + 1, headerBottom, x + cellW - 1, headerBottom);

          // ── FOOTER: "Ult. modificacion: DD/MM/YYYY" ──
          const prodDate = product.fechaActualizacion
            ? new Date(product.fechaActualizacion).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
            : today;
          pdf.setDrawColor(220);
          pdf.setLineWidth(0.1);
          pdf.line(x + 1, footerTop, x + cellW - 1, footerTop);
          pdf.setFont("helvetica", "italic");
          pdf.setFontSize(7);
          pdf.setTextColor(130);
          pdf.text(`Ult. modificacion: ${prodDate}`, x + cellW - pad, footerTop + 2.8, { align: "right" });
          pdf.setTextColor(0);

          // ── Measure name (up to 3 lines, auto-shrink) ──
          const nameMaxW = cellW - pad * 2 - 2;
          let nfs = 12;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(nfs);
          let nLines: string[] = pdf.splitTextToSize(product.nombre, nameMaxW);
          while (nLines.length > 3 && nfs > 7) {
            nfs -= 0.5;
            pdf.setFontSize(nfs);
            nLines = pdf.splitTextToSize(product.nombre, nameMaxW);
          }
          if (nLines.length > 2 && nfs > 9) {
            let tryFs = nfs;
            while (nLines.length > 2 && tryFs > 9) {
              tryFs -= 0.5;
              pdf.setFontSize(tryFs);
              nLines = pdf.splitTextToSize(product.nombre, nameMaxW);
            }
            if (nLines.length <= 2) nfs = tryFs;
            else {
              pdf.setFontSize(nfs);
              nLines = pdf.splitTextToSize(product.nombre, nameMaxW);
            }
          }
          const nlh = nfs * 0.42;
          const maxNL = Math.min(nLines.length, 3);
          const nameTextH = maxNL * nlh;

          // ── Position price band + box from bottom up ──
          const priceFontSize = hasBox ? 27 : 30;
          const priceTextH = priceFontSize * 0.35;
          const bandH = priceTextH + 6;
          const boxLineH = hasBox ? 5 : 0;
          const gap2 = hasBox ? 1.5 : 0;

          // Band + box anchored from footer
          const boxBottom = footerTop - 0.5;
          const bandTop = boxBottom - boxLineH - gap2 - bandH;

          // ── NAME (centered between header line and price band) ──
          const nameZoneTop = headerBottom + 1;
          const nameZoneH = bandTop - nameZoneTop - 1;
          const nameStartY = nameZoneTop + (nameZoneH - nameTextH) / 2 + nlh * 0.75;

          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(nfs);
          pdf.setTextColor(0);
          for (let li = 0; li < maxNL; li++) {
            let lt = String(nLines[li]);
            if (li === maxNL - 1 && nLines.length > maxNL) {
              while (pdf.getTextWidth(lt + "...") > nameMaxW && lt.length > 0) lt = lt.slice(0, -1);
              lt += "...";
            }
            pdf.text(lt, centerX, nameStartY + li * nlh, { align: "center" });
          }

          // ── PRICE (gray band, with decimals) ──
          pdf.setFillColor(235, 235, 235);
          pdf.rect(x + 0.5, bandTop, cellW - 1, bandH, "F");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(priceFontSize);
          pdf.setTextColor(0);
          pdf.text(formatCurrency(displayPrice, true), centerX, bandTop + bandH / 2 + priceFontSize * 0.13, { align: "center" });
          let cursor = bandTop + bandH + gap2;

          // ── BOX INFO ──
          if (hasBox) {
            const pn = product.nombrePresentacion;
            const hasQty = /x\s*\d|×\s*\d|\d+\s*u/.test(pn);
            const presLabel = hasQty ? pn : `${pn} x${product.unidadesCaja}`;
            const unitInBox = boxPrice / product.unidadesCaja;
            const boxMainText = `${presLabel}  ·  ${formatCurrency(boxPrice)}`;
            const boxUnitText = `(${formatCurrency(unitInBox, true)} c/u)`;

            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(13);
            const mainW = pdf.getTextWidth(boxMainText);
            pdf.setFont("helvetica", "italic");
            pdf.setFontSize(10);
            const unitW = pdf.getTextWidth(boxUnitText);
            const totalW = mainW + 2 + unitW;
            const startX = centerX - totalW / 2;

            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(13);
            pdf.setTextColor(40);
            pdf.text(boxMainText, startX, cursor + 3.5);

            pdf.setFont("helvetica", "italic");
            pdf.setFontSize(10);
            pdf.setTextColor(130);
            pdf.text(boxUnitText, startX + mainW + 2, cursor + 3.5);
            pdf.setTextColor(0);
          }
        }, (done, total) => setGeneratingProgress({ done, total }));
      }

      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
      setShowPreview(true);
    } finally {
      setGenerating(false);
      setGeneratingProgress(null);
    }
  };

  const downloadPDF = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = "lista-precios.pdf";
    a.click();
  };

  // ─── Toggle component ───
  const Toggle = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary">
        <option value="">Todos</option>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </select>
    </div>
  );

  // ─── Toggle Switch component ───
  const ToggleSwitch = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <div onClick={onChange} className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${checked ? "bg-primary" : "bg-muted"}`}>
        <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
      <span className="text-sm">{label}</span>
    </label>
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-32">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Cargando productos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/productos" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Lista de Precios</h1>
              <p className="text-sm text-muted-foreground">{filtered.length} de {products.length} productos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchProducts}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Actualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
              <Settings className="w-4 h-4 mr-2" />
              Configuración
            </Button>
            {selected.size > 0 && (
              <Button size="sm" onClick={handleGenerateClick} disabled={generating}>
                {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Generar PDF ({selected.size})
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-5">
        {/* Search + filters */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Nombre del producto..."
                  value={filters.search}
                  onChange={(e) => updateFilter("search", e.target.value)}
                  className="w-full border border-border rounded-lg pl-9 pr-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`border rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${showFilters ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
            >
              <Filter className="w-4 h-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="bg-background text-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">{activeFilterCount}</span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                <SearchableSelect
                  label="Categoría"
                  value={filters.categoria || "all"}
                  onChange={(v) => { updateFilter("categoria", v === "all" ? "" : v); updateFilter("subcategoria", ""); }}
                  allLabel="Todas las categorías"
                  options={categorias.map((c) => ({ value: c, label: c }))}
                />
                <SearchableSelect
                  label="Subcategoría"
                  value={filters.subcategoria || "all"}
                  onChange={(v) => updateFilter("subcategoria", v === "all" ? "" : v)}
                  allLabel="Todas las subcategorías"
                  options={subcategorias.map((s) => ({ value: s, label: s }))}
                />
                <SearchableSelect
                  label="Marca"
                  value={filters.marca || "all"}
                  onChange={(v) => updateFilter("marca", v === "all" ? "" : v)}
                  allLabel="Todas las marcas"
                  options={marcas.map((m) => ({ value: m, label: m }))}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Precio modif. desde</label>
                  <input type="date" value={filters.fechaDesde} onChange={(e) => updateFilter("fechaDesde", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Precio modif. hasta</label>
                  <input type="date" value={filters.fechaHasta} onChange={(e) => updateFilter("fechaHasta", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <Toggle label="Con stock" value={filters.hayStock} onChange={(v) => updateFilter("hayStock", v)} />
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Ordenar por</label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as "nombre" | "modificacion")}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="nombre">Nombre A-Z</option>
                    <option value="modificacion">Últ. modificación de precio</option>
                  </select>
                </div>
              </div>
              {activeFilterCount > 0 && (
                <button onClick={() => setFilters({ ...DEFAULT_FILTERS, search: filters.search })} className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={allFilteredSelected ? deselectAllFiltered : selectAllFiltered}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {allFilteredSelected ? "Deseleccionar todos" : "Seleccionar todos"} ({filtered.length})
            </button>
            {selected.size > 0 && (
              <>
                <span className="text-border">|</span>
                <button onClick={clearSelection} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Limpiar selección</button>
              </>
            )}
          </div>
          {selected.size > 0 && (
            <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-2.5 py-1 rounded-full text-xs font-medium">
              {selected.size} seleccionados
            </span>
          )}
        </div>

        {/* Product table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-3 text-left w-10"></th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Producto</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Categoría</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Marca</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Precio</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Últ. mod.</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginated.map((p) => {
                const idx = products.indexOf(p);
                const isSelected = selected.has(idx);
                return (
                  <tr key={idx} onClick={() => toggleSelect(idx)} className={`cursor-pointer transition-colors ${isSelected ? "bg-accent" : "hover:bg-accent/50"}`}>
                    <td className="px-3 py-3 text-center">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                        {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-medium">{p.nombre}</td>
                    <td className="px-3 py-3 text-muted-foreground hidden lg:table-cell">
                      <span className="text-xs">{p.categoria}</span>
                      {p.subcategoria && <span className="text-muted-foreground/50 text-xs block">{p.subcategoria}</span>}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground text-xs">{p.marca}</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatCurrency(p.precioUnitario)}</td>
                    <td className="px-3 py-3 text-center text-xs text-muted-foreground">
                      {p.fechaActualizacion ? (() => { const d = new Date(p.fechaActualizacion); return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }); })() : "—"}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {!p.hayStock ? (
                        <span className="inline-block bg-red-100 text-red-600 text-[10px] font-medium px-2 py-0.5 rounded-full">Sin stock</span>
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground text-sm">No se encontraron productos</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {(page - 1) * itemsPerPage + 1}–{Math.min(page * itemsPerPage, filtered.length)} de {filtered.length} productos
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1} className="px-2.5 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-2.5 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | string)[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  typeof p === "string" ? (
                    <span key={`dots-${i}`} className="px-1 text-muted-foreground text-sm">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-9 h-9 text-sm rounded-lg transition-colors ${page === p ? "bg-primary text-primary-foreground font-medium" : "border border-border text-muted-foreground hover:bg-accent"}`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2.5 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2.5 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Style Picker Modal */}
      {showStylePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <h2 className="text-lg font-semibold">Elegí el estilo del PDF</h2>
              <button onClick={() => setShowStylePicker(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-3 gap-4 max-w-4xl mx-auto overflow-y-auto">
              {/* Premium — Cartel A4 diseño editorial */}
              <button
                onClick={() => { setShowStylePicker(false); setShowPremiumConfig(true); }}
                className="group border-2 border-border rounded-xl p-4 hover:border-primary transition-all text-left"
              >
                <div className="border border-border rounded-lg p-3 mb-3 bg-white aspect-[4/3] flex flex-col">
                  <div className="flex items-start justify-between mb-1">
                    <div className="w-5 h-2 bg-black rounded-sm"></div>
                    <div className="flex items-center gap-0.5 bg-black rounded-full px-1 py-0.5">
                      <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                      <span className="text-[3px] font-bold text-white">OFERTA</span>
                    </div>
                  </div>
                  <p className="text-[3px] text-muted-foreground mt-1 tracking-wider">MARCA · CATEGORÍA</p>
                  <p className="text-[8px] font-black leading-none mt-0.5">Producto Ejemplo</p>
                  <p className="text-[3px] text-muted-foreground mt-0.5">200g · Caja x 12 unidades</p>
                  <div className="flex items-end gap-1 mt-1 flex-1">
                    <div className="bg-black text-white text-[8px] font-black px-1.5 py-0.5 leading-none rounded-sm">$1.200</div>
                    <div className="text-[3px] text-muted-foreground leading-tight">PRECIO UNIDAD<br/><b className="text-black text-[5px]">$100</b> c/u</div>
                  </div>
                  <div className="border-t border-border mt-1 pt-0.5 flex justify-between items-end">
                    <span className="text-[3px]">→ www.dulcesur.com</span>
                    <div className="w-2.5 h-2.5 bg-muted-foreground/40 rounded-sm"></div>
                  </div>
                </div>
                <p className="font-semibold text-sm">✨ Cartel Premium (B&amp;N)</p>
                <p className="text-xs text-muted-foreground mt-0.5">Diseño editorial para imprimir en blanco y negro</p>
              </button>

              {/* Góndola — Carteles para estantes */}
              <button onClick={() => generatePDF("gondola")} className="group border-2 border-border rounded-xl p-4 hover:border-primary transition-all text-left">
                <div className="border border-border rounded-lg p-3 mb-3 bg-accent/30">
                  <div className="flex justify-between items-center mb-0.5">
                    <div className="w-3 h-2 bg-muted-foreground/30 rounded-sm"></div>
                    <span className="text-[3px] text-muted-foreground">www.dulcesur.com</span>
                  </div>
                  <div className="border-t border-border pt-0.5">
                    <p className="text-[5px] font-bold text-center leading-tight">Producto Ejemplo 200g</p>
                  </div>
                  <div className="bg-muted/40 rounded-sm py-1 my-0.5">
                    <p className="text-[11px] font-bold text-center leading-none">$1.200,00</p>
                  </div>
                  <div className="border-t border-border pt-0.5 flex justify-between items-center">
                    <span className="text-[4px] font-bold text-muted-foreground">Caja x12</span>
                    <div className="text-right">
                      <span className="text-[5px] font-bold">$14.400</span>
                      <span className="text-[3px] text-muted-foreground ml-0.5 italic">($1.200,00 c/u)</span>
                    </div>
                  </div>
                </div>
                <p className="font-semibold text-sm">Carteles de góndola</p>
                <p className="text-xs text-muted-foreground mt-0.5">15 etiquetas por hoja A4 apaisada</p>
              </button>

              {/* Lista General */}
              <div className="col-span-2 border-2 border-border rounded-xl p-4 space-y-3">
                <div className="border border-border rounded-lg p-3 bg-accent/30">
                  <p className="text-[6px] font-bold text-center mb-1">LISTA DE PRECIOS - DULCESUR</p>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[4px] border-b border-border pb-0.5">
                      <span className="font-bold w-1/3">Producto</span><span className="font-bold w-1/6 text-right">Precio</span><span className="font-bold w-1/6 text-right">Caja (Cant.)</span><span className="font-bold w-1/6 text-right">Dto.</span>
                    </div>
                    <div className="flex justify-between text-[4px]"><span className="w-1/3">Chocolate 200g</span><span className="w-1/6 text-right">$1.200</span><span className="w-1/6 text-right">$12.000 (10)</span><span className="w-1/6 text-right text-green-600">-10%</span></div>
                    <div className="flex justify-between text-[4px]"><span className="w-1/3">Galletitas 315g</span><span className="w-1/6 text-right">$850</span><span className="w-1/6 text-right">$10.200 (12)</span><span className="w-1/6 text-right">—</span></div>
                  </div>
                </div>
                <p className="font-semibold text-sm">📋 Lista General de Precios</p>
                <p className="text-xs text-muted-foreground">Con presentaciones, descuentos y fecha de actualización</p>

                {/* Agrupación */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Agrupar:</span>
                  {([["none", "Sin agrupar"], ["categoria", "Por categoría"], ["subcategoria", "Cat + Subcat"]] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setListaGroupMode(val)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition border ${listaGroupMode === val ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/50"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button onClick={() => generatePDF("lista")} className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-semibold hover:bg-primary/90 transition">
                  Generar Lista PDF
                </button>
              </div>

              {/* Variaciones de precio */}
              <div className="col-span-3 border-2 border-border rounded-xl p-4 space-y-3">
                <div className="border border-border rounded-lg p-3 bg-accent/30">
                  <p className="text-[6px] font-bold mb-1">Lista de Precios Actualizados</p>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[4px] border-b border-border pb-0.5">
                      <span className="font-bold w-1/4">Código</span><span className="font-bold w-1/4">Producto</span><span className="font-bold w-1/6 text-right">Anterior</span><span className="font-bold w-1/6 text-right">Nuevo</span><span className="font-bold w-12 text-right">Var.</span>
                    </div>
                    <div className="flex justify-between text-[4px]"><span className="w-1/4">7790070</span><span className="w-1/4">Aceite 900ml</span><span className="w-1/6 text-right text-muted-foreground">$2.200</span><span className="w-1/6 text-right font-bold">$2.400</span><span className="w-12 text-right text-red-500">+9%</span></div>
                    <div className="flex justify-between text-[4px]"><span className="w-1/4">7798066</span><span className="w-1/4">Papas 140g</span><span className="w-1/6 text-right text-muted-foreground">$1.100</span><span className="w-1/6 text-right font-bold">$1.200</span><span className="w-12 text-right text-red-500">+9%</span></div>
                  </div>
                </div>
                <p className="font-semibold text-sm">📊 Variaciones de precio</p>
                <p className="text-xs text-muted-foreground">Últimos cambios con anterior, nuevo, marca, categoría y variación %</p>
                <button onClick={() => generatePDF("variaciones")} className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-semibold hover:bg-primary/90 transition">
                  Generar PDF Variaciones
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Premium Config Modal (pre-generación) */}
      {showPremiumConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="text-lg font-semibold">Configurar Cartel Premium</h2>
                <p className="text-xs text-muted-foreground">A4 horizontal · B&amp;N</p>
              </div>
              <button onClick={() => setShowPremiumConfig(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium mb-2">Tipo de oferta</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["simple", "Precio simple", "Solo precio unitario grande"],
                    ["packUnidad", "Pack + unidad", "Precio por caja grande + precio unidad al costado"],
                  ] as const).map(([val, label, desc]) => (
                    <button
                      key={val}
                      onClick={() => setPremiumOpts((p) => ({ ...p, tipoOferta: val }))}
                      className={`p-3 rounded-lg border text-left transition ${
                        premiumOpts.tipoOferta === val ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Etiqueta del badge</label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={premiumOpts.mostrarBadge}
                      onChange={(e) => setPremiumOpts((p) => ({ ...p, mostrarBadge: e.target.checked }))}
                      className="accent-primary"
                    />
                    Mostrar
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {["OFERTA DE LA SEMANA", "IMPERDIBLE", "NUEVO", "OFERTA"].map((preset) => (
                    <button
                      key={preset}
                      disabled={!premiumOpts.mostrarBadge}
                      onClick={() => setPremiumOpts((p) => ({ ...p, etiquetaBadge: preset }))}
                      className={`px-3 py-2 rounded-lg border text-xs font-semibold transition disabled:opacity-50 ${
                        premiumOpts.etiquetaBadge === preset ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  disabled={!premiumOpts.mostrarBadge}
                  value={premiumOpts.etiquetaBadge}
                  onChange={(e) => setPremiumOpts((p) => ({ ...p, etiquetaBadge: e.target.value }))}
                  placeholder="O escribí el tuyo..."
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Texto superior (arriba del nombre)</label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {([
                    ["auto", "Automático", "Marca · Categoría"],
                    ["custom", "Personalizado", "Ej: Pascuas 2026"],
                    ["oculto", "Oculto", "Sin texto"],
                  ] as const).map(([val, label, desc]) => (
                    <button
                      key={val}
                      onClick={() => setPremiumOpts((p) => ({ ...p, captionModo: val }))}
                      className={`p-2.5 rounded-lg border text-left transition ${
                        premiumOpts.captionModo === val ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
                {premiumOpts.captionModo === "custom" && (
                  <input
                    type="text"
                    value={premiumOpts.captionCustom}
                    onChange={(e) => setPremiumOpts((p) => ({ ...p, captionCustom: e.target.value }))}
                    placeholder="Ej: PASCUAS 2026 · STOCK LIMITADO"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
              </div>

              <div className="border border-border rounded-lg p-3 bg-accent/30">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={premiumOpts.mostrarComponentesCombo}
                    onChange={(e) => setPremiumOpts((p) => ({ ...p, mostrarComponentesCombo: e.target.checked }))}
                    className="accent-primary w-4 h-4"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Mostrar componentes del combo</p>
                    <p className="text-[11px] text-muted-foreground">Si el producto es un combo, lista los productos que lo integran debajo del subtítulo (hasta 8).</p>
                  </div>
                </label>
              </div>

              <details className="border-t border-border pt-4">
                <summary className="text-sm font-medium cursor-pointer select-none">Tamaños (ajuste fino)</summary>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Logo ({config.premium_logoTamaño}mm)</label>
                    <input type="range" min={8} max={40} step={1} value={config.premium_logoTamaño} onChange={(e) => updateConfig("premium_logoTamaño", Number(e.target.value))} className="w-full accent-primary" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Caption ({config.premium_tamañoCaption}pt)</label>
                    <input type="range" min={6} max={16} step={0.5} value={config.premium_tamañoCaption} onChange={(e) => updateConfig("premium_tamañoCaption", Number(e.target.value))} className="w-full accent-primary" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">Nombre del producto ({config.premium_tamañoNombre}pt)</label>
                    <input type="range" min={28} max={80} step={1} value={config.premium_tamañoNombre} onChange={(e) => updateConfig("premium_tamañoNombre", Number(e.target.value))} className="w-full accent-primary" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Subtítulo ({config.premium_tamañoSubtitulo}pt)</label>
                    <input type="range" min={8} max={24} step={0.5} value={config.premium_tamañoSubtitulo} onChange={(e) => updateConfig("premium_tamañoSubtitulo", Number(e.target.value))} className="w-full accent-primary" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Precio principal ({config.premium_tamañoPrecio}pt)</label>
                    <input type="range" min={40} max={120} step={2} value={config.premium_tamañoPrecio} onChange={(e) => updateConfig("premium_tamañoPrecio", Number(e.target.value))} className="w-full accent-primary" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">Precio por unidad ({config.premium_tamañoPrecioUnidad}pt)</label>
                    <input type="range" min={14} max={48} step={1} value={config.premium_tamañoPrecioUnidad} onChange={(e) => updateConfig("premium_tamañoPrecioUnidad", Number(e.target.value))} className="w-full accent-primary" />
                  </div>
                </div>
              </details>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-border shrink-0">
              <button
                onClick={() => setShowPremiumConfig(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-accent transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setShowPremiumConfig(false); generatePDF("premium", premiumOpts); }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition"
              >
                Generar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`bg-card rounded-2xl shadow-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-border ${configTab === "combinado" || configTab === "duo" ? "max-w-4xl" : "max-w-lg"}`}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold">Configuración del PDF</h2>
              <button onClick={() => setShowConfig(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex border-b border-border px-6 overflow-x-auto">
              {(["general"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setConfigTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    configTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {"General"}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-6" style={{ maxHeight: "60vh" }}>
              {configTab === "general" && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Transferencia</h3>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Porcentaje adicional (%)</label>
                      <input type="number" min={0} max={100} step={0.5} value={config.porcentajeTransferencia} onChange={(e) => updateConfig("porcentajeTransferencia", Number(e.target.value))} className="w-32 border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Página web</h3>
                    <input type="text" value={config.webUrl} onChange={(e) => updateConfig("webUrl", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Logo</h3>
                    <div className="flex items-center gap-4">
                      {logoBase64 && <img src={logoBase64} alt="Logo" className="h-12 object-contain border border-border rounded-lg p-1" />}
                      <label className="cursor-pointer text-sm border border-border rounded-lg px-3 py-2 hover:bg-accent transition-colors">
                        {logoBase64 ? "Cambiar logo" : "Subir logo"}
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs text-muted-foreground mb-1">Tamaño del logo ({config.logoTamaño}mm)</label>
                      <input type="range" min={4} max={30} step={1} value={config.logoTamaño} onChange={(e) => updateConfig("logoTamaño", Number(e.target.value))} className="w-full accent-primary" />
                    </div>
                  </div>
                </>
              )}

              {configTab === "combinado" && (
                <div className="flex gap-6">
                  {/* Live Preview */}
                  <div className="flex-shrink-0" style={{ width: "240px" }}>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Vista previa</h3>
                    {(() => {
                      const cellWmm = (210 - 10) / config.combinado_columnas;
                      const cellHmm = (297 - 10) / config.combinado_filas;
                      const scale = 230 / cellWmm;
                      const previewW = cellWmm * scale;
                      const previewH = cellHmm * scale;
                      return (
                    <div className="border border-border rounded-lg bg-white relative" style={{ width: `${previewW}px`, height: `${previewH}px` }}>
                      {/* Logo */}
                      {config.combinado_mostrarLogo && logoBase64 && (
                        <img src={logoBase64} alt="Logo" className="absolute object-contain" style={{ top: "8px", left: "8px", height: `${config.logoTamaño * 2.5}px`, width: `${config.logoTamaño * 2.5 * logoAspectRatio}px` }} />
                      )}
                      {config.combinado_mostrarLogo && !logoBase64 && (
                        <div className="absolute bg-gray-200 rounded" style={{ top: "8px", left: "8px", height: `${config.logoTamaño * 2.5}px`, width: `${config.logoTamaño * 2.5 * logoAspectRatio}px` }} />
                      )}
                      {/* Marca */}
                      <span className="absolute text-[8px] text-gray-400 uppercase" style={{ top: "12px", right: "8px" }}>MARCA</span>
                      {/* Nombre */}
                      <p className="absolute left-0 right-0 text-center font-bold text-black" style={{ top: `${18 + config.combinado_nombreOffset * 3}px`, fontSize: `${config.combinado_tamañoNombre}px`, padding: "0 8px" }}>
                        Producto Ejemplo
                      </p>
                      {/* Precio grande */}
                      <p className="absolute left-0 right-0 text-center font-bold text-black" style={{ top: "42%", fontSize: `${Math.min(config.combinado_tamañoPrecio, 36)}px`, transform: "translateY(-50%)" }}>
                        $1.290
                      </p>
                      {/* Divider line */}
                      <div className="absolute left-2 right-2 bg-gray-200" style={{ bottom: `${config.combinado_divisorY * 2.8}%`, height: "1px" }} />
                      {/* Efect row */}
                      <div className="absolute left-2 right-2" style={{ bottom: `${config.combinado_efectLabelY * 2.8}%` }}>
                        <div className="flex justify-between items-center">
                          <span className="text-[7px] text-gray-400">Efectivo</span>
                          <span className="text-[7px] text-gray-400">Caja x16</span>
                        </div>
                      </div>
                      <div className="absolute left-2 right-2" style={{ bottom: `${config.combinado_efectPrecioY * 2.8}%` }}>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-bold text-black">$1.290</span>
                          <span className="text-[8px] font-bold text-gray-500">$20.640</span>
                        </div>
                      </div>
                      {/* Transf row */}
                      <div className="absolute left-2 right-2" style={{ bottom: `${config.combinado_transfLabelY * 2.8}%` }}>
                        <div className="flex justify-between items-center">
                          <span className="text-[7px] text-gray-400">{`Transf. (${config.porcentajeTransferencia}%)`}</span>
                          <span className="text-[7px] text-gray-400">Caja x16</span>
                        </div>
                      </div>
                      <div className="absolute left-2 right-2" style={{ bottom: `${config.combinado_transfPrecioY * 2.8}%` }}>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-bold text-gray-500">$1.316</span>
                          <span className="text-[8px] font-bold text-gray-500">$21.053</span>
                        </div>
                      </div>
                      {/* Footer line */}
                      <div className="absolute left-2 right-2 bg-gray-200" style={{ bottom: `${config.combinado_footerLineY * 2.8}%`, height: "1px" }} />
                      {/* Footer text */}
                      <div className="absolute left-2 right-2" style={{ bottom: `${config.combinado_footerTextY * 2.2}%` }}>
                        <div className="flex justify-between items-center">
                          {config.combinado_mostrarWeb && <span className="text-gray-400" style={{ fontSize: `${config.combinado_footerFontSize}px` }}>{config.webUrl}</span>}
                          {config.combinado_mostrarFecha && <span className="text-gray-400" style={{ fontSize: `${config.combinado_footerFontSize}px` }}>20/3/2026</span>}
                        </div>
                      </div>
                    </div>
                      );
                    })()}
                  </div>
                  {/* Controls */}
                  <div className="flex-1 space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Grilla</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Columnas</label>
                          <input type="number" min={1} max={5} value={config.combinado_columnas} onChange={(e) => updateConfig("combinado_columnas", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Filas</label>
                          <input type="number" min={1} max={12} value={config.combinado_filas} onChange={(e) => updateConfig("combinado_filas", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{config.combinado_columnas * config.combinado_filas} carteles por página</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Tamaños de fuente</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Nombre (pt)</label>
                          <input type="number" min={6} max={20} value={config.combinado_tamañoNombre} onChange={(e) => updateConfig("combinado_tamañoNombre", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Precio (pt)</label>
                          <input type="number" min={10} max={48} value={config.combinado_tamañoPrecio} onChange={(e) => updateConfig("combinado_tamañoPrecio", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Posiciones (mm desde borde)</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Nombre offset</label>
                          <input type="number" min={-5} max={10} step={0.5} value={config.combinado_nombreOffset} onChange={(e) => updateConfig("combinado_nombreOffset", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Línea divisoria</label>
                          <input type="number" min={5} max={35} step={0.5} value={config.combinado_divisorY} onChange={(e) => updateConfig("combinado_divisorY", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Efect. etiqueta</label>
                          <input type="number" min={3} max={30} step={0.5} value={config.combinado_efectLabelY} onChange={(e) => updateConfig("combinado_efectLabelY", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Efect. precio</label>
                          <input type="number" min={3} max={30} step={0.5} value={config.combinado_efectPrecioY} onChange={(e) => updateConfig("combinado_efectPrecioY", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Transf. etiqueta</label>
                          <input type="number" min={3} max={25} step={0.5} value={config.combinado_transfLabelY} onChange={(e) => updateConfig("combinado_transfLabelY", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Transf. precio</label>
                          <input type="number" min={3} max={25} step={0.5} value={config.combinado_transfPrecioY} onChange={(e) => updateConfig("combinado_transfPrecioY", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Línea footer</label>
                          <input type="number" min={1} max={15} step={0.5} value={config.combinado_footerLineY} onChange={(e) => updateConfig("combinado_footerLineY", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Footer texto</label>
                          <input type="number" min={0.5} max={10} step={0.5} value={config.combinado_footerTextY} onChange={(e) => updateConfig("combinado_footerTextY", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs text-muted-foreground mb-1">Footer tamaño fuente (pt)</label>
                        <input type="number" min={3} max={10} step={0.5} value={config.combinado_footerFontSize} onChange={(e) => updateConfig("combinado_footerFontSize", Number(e.target.value))} className="w-32 border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Elementos visibles</h3>
                      <div className="space-y-3">
                        <ToggleSwitch checked={config.combinado_mostrarPrecioCaja} onChange={() => updateConfig("combinado_mostrarPrecioCaja", !config.combinado_mostrarPrecioCaja)} label="Precio por caja" />
                        <ToggleSwitch checked={config.combinado_mostrarLogo} onChange={() => updateConfig("combinado_mostrarLogo", !config.combinado_mostrarLogo)} label="Logo" />
                        <ToggleSwitch checked={config.combinado_mostrarWeb} onChange={() => updateConfig("combinado_mostrarWeb", !config.combinado_mostrarWeb)} label="Página web" />
                        <ToggleSwitch checked={config.combinado_mostrarFecha} onChange={() => updateConfig("combinado_mostrarFecha", !config.combinado_mostrarFecha)} label="Fecha actual" />
                      </div>
                    </div>
                    {config.combinado_mostrarLogo && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Logo</h3>
                      <div className="flex items-center gap-4">
                        {logoBase64 && <img src={logoBase64} alt="Logo" className="h-12 object-contain border border-border rounded-lg p-1" />}
                        <label className="cursor-pointer text-sm border border-border rounded-lg px-3 py-2 hover:bg-accent transition-colors">
                          {logoBase64 ? "Cambiar logo" : "Subir logo"}
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        </label>
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs text-muted-foreground mb-1">Tamaño del logo ({config.logoTamaño}mm)</label>
                        <input type="range" min={4} max={30} step={1} value={config.logoTamaño} onChange={(e) => updateConfig("logoTamaño", Number(e.target.value))} className="w-full accent-primary" />
                      </div>
                    </div>
                    )}
                  </div>
                </div>
              )}

              {configTab === "duo" && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Grilla</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Columnas</label>
                        <input type="number" min={1} max={4} value={config.duo_columnas} onChange={(e) => updateConfig("duo_columnas", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Filas</label>
                        <input type="number" min={1} max={8} value={config.duo_filas} onChange={(e) => updateConfig("duo_filas", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{config.duo_columnas * config.duo_filas} carteles por página</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Tamaños de fuente</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Nombre (pt)</label>
                        <input type="number" min={6} max={20} value={config.duo_tamañoNombre} onChange={(e) => updateConfig("duo_tamañoNombre", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Precio (pt)</label>
                        <input type="number" min={10} max={48} value={config.duo_tamañoPrecio} onChange={(e) => updateConfig("duo_tamañoPrecio", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Elementos visibles</h3>
                    <div className="space-y-3">
                      <ToggleSwitch checked={config.duo_mostrarLogo} onChange={() => updateConfig("duo_mostrarLogo", !config.duo_mostrarLogo)} label="Logo" />
                      <ToggleSwitch checked={config.duo_mostrarWeb} onChange={() => updateConfig("duo_mostrarWeb", !config.duo_mostrarWeb)} label="Página web" />
                      <ToggleSwitch checked={config.duo_mostrarFecha} onChange={() => updateConfig("duo_mostrarFecha", !config.duo_mostrarFecha)} label="Fecha actual" />
                    </div>
                  </div>
                  {config.duo_mostrarLogo && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Logo</h3>
                    <div className="flex items-center gap-4">
                      {logoBase64 && <img src={logoBase64} alt="Logo" className="h-12 object-contain border border-border rounded-lg p-1" />}
                      <label className="cursor-pointer text-sm border border-border rounded-lg px-3 py-2 hover:bg-accent transition-colors">
                        {logoBase64 ? "Cambiar logo" : "Subir logo"}
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs text-muted-foreground mb-1">Tamaño del logo ({config.logoTamaño}mm)</label>
                      <input type="range" min={4} max={30} step={1} value={config.logoTamaño} onChange={(e) => updateConfig("logoTamaño", Number(e.target.value))} className="w-full accent-primary" />
                    </div>
                  </div>
                  )}
                </>
              )}

            </div>

            <div className="px-6 py-4 border-t border-border flex justify-between">
              <button onClick={() => setConfig(DEFAULT_CONFIG)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Restaurar valores</button>
              <button onClick={() => setShowConfig(false)} className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* Generating overlay */}
      {generating && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-background rounded-2xl px-8 py-6 flex flex-col items-center gap-4 shadow-xl min-w-[260px]">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-semibold text-sm">Generando PDF...</p>
              {generatingProgress && (
                <>
                  <p className="text-xs text-muted-foreground mt-1">
                    {generatingProgress.done} de {generatingProgress.total} productos
                  </p>
                  <div className="w-48 h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-200"
                      style={{ width: `${Math.round((generatingProgress.done / generatingProgress.total) * 100)}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {showPreview && pdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-2xl w-[90vw] h-[90vh] flex flex-col overflow-hidden border border-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold">Vista previa del PDF</h2>
              <div className="flex items-center gap-3">
                <button onClick={downloadPDF} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Descargar
                </button>
                <button onClick={() => setShowPreview(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-accent/30">
              <iframe src={pdfUrl} className="w-full h-full" title="Vista previa PDF" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
