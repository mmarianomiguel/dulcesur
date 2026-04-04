"use client";

import { SearchableSelect } from "@/components/searchable-select";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
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
  hayStock: boolean;
  id: string;
  categoria: string;
  subcategoria: string;
  fechaActualizacion: string;
  codigo: string;
  precioAnterior: number;
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
  poster_tamañoNombre: number;
  poster_tamañoPrecio: number;
  poster_mostrarLogo: boolean;
  poster_mostrarWeb: boolean;
  poster_mostrarPrecioUnitario: boolean;
}

type PdfStyle = "combinado" | "duo" | "simple" | "poster" | "lista" | "variaciones" | "gondola";
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
  poster_tamañoNombre: 36, poster_tamañoPrecio: 72, poster_mostrarLogo: true, poster_mostrarWeb: true, poster_mostrarPrecioUnitario: true,
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

export default function ListaPreciosPage() {

  const [products, setProducts] = useState<Product[]>([]);
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
  const [listaGroupMode, setListaGroupMode] = useState<"none" | "categoria" | "subcategoria">("categoria");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoAspectRatio, setLogoAspectRatio] = useState(1); // width / height
  const [generating, setGenerating] = useState(false);
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
        hayStock: p.stock > 0,
        id: p.id,
        categoria: dbCategoria || "Sin categoría",
        subcategoria: (p.subcategoria_id && subcatMap[p.subcategoria_id]) || "",
        fechaActualizacion: fechaAct,
        codigo: p.codigo || "",
        precioAnterior: p.precio_anterior || 0,
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
  }, [products, filters, sortOrder]);

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

  const handleGenerateClick = () => setShowStylePicker(true);

  // ─── PDF Generation ───
  const generatePDF = (style: PdfStyle) => {
    setShowStylePicker(false);
    setGenerating(true);

    setTimeout(async () => {
      const selectedProducts = products.filter((_, i) => selected.has(i));
      if (selectedProducts.length === 0) { setGenerating(false); return; }

      const { jsPDF } = await import("jspdf");
      const isLandscape = style === "poster" || style === "gondola";
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

        selectedProducts.forEach((product, idx) => {
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
        });
      }

      if (style === "duo") {
        // Same grid as combinado but with clear zones using % of cell height
        const cols = config.duo_columnas;
        const rows = config.duo_filas;
        const perPage = cols * rows;
        const cellW = (pageW - margin * 2) / cols;
        const cellH = (pageH - margin * 2) / rows;

        selectedProducts.forEach((product, idx) => {
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
        });
      }

      if (style === "simple") {
        // Same as duo but bottom zone only shows caja/bulto/display + price (no efectivo/transf)
        const cols = config.duo_columnas;
        const rows = config.duo_filas;
        const perPage = cols * rows;
        const cellW = (pageW - margin * 2) / cols;
        const cellH = (pageH - margin * 2) / rows;

        selectedProducts.forEach((product, idx) => {
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
        });
      }

      if (style === "poster") {
        // Generate QR code for web URL
        let qrDataUrl: string | null = null;
        if (config.poster_mostrarWeb && config.webUrl) {
          try {
            const QRCode = (await import("qrcode")).default;
            const url = config.webUrl.startsWith("http") ? config.webUrl : `https://${config.webUrl}`;
            qrDataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1, color: { dark: "#000000", light: "#ffffff" } });
          } catch {}
        }

        selectedProducts.forEach((product, idx) => {
          if (idx > 0) pdf.addPage();
          const displayPrice = product.enOferta && product.precioOferta > 0 ? product.precioOferta : product.precioUnitario;
          const boxPrice = product.precioCaja > 0 ? product.precioCaja : 0;
          const hasUnits = product.unidadesCaja > 0;

          // ── Logo (centered at top) ──
          let contentY = margin + 8;
          if (config.poster_mostrarLogo && logoBase64) {
            const posterLogoH = config.logoTamaño * 2.5;
            const posterLogoW = posterLogoH * logoAspectRatio;
            const logoX = (pageW - posterLogoW) / 2;
            try { pdf.addImage(logoBase64, "PNG", logoX, margin + 5, posterLogoW, posterLogoH); } catch {}
            contentY = margin + 5 + posterLogoH + 8;
          }

          // ── "OFERTA" badge (rounded dark pill) ──
          const ofertaFontSize = 28;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(ofertaFontSize);
          const ofertaText = "OFERTA";
          const ofertaTextW = pdf.getTextWidth(ofertaText);
          const pillW = ofertaTextW + 30;
          const pillH = 18;
          const pillX = (pageW - pillW) / 2;
          const pillY = contentY;
          const pillR = pillH / 2;
          // Draw rounded rect (pill shape)
          pdf.setFillColor(20, 20, 20);
          pdf.roundedRect(pillX, pillY, pillW, pillH, pillR, pillR, "F");
          // Text inside pill
          pdf.setTextColor(255, 255, 255);
          pdf.text(ofertaText, pageW / 2, pillY + pillH / 2 + ofertaFontSize * 0.13, { align: "center" });
          pdf.setTextColor(0);

          // ── Product name (centered) ──
          const nameY = pillY + pillH + 15;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.poster_tamañoNombre);
          const nameLines: string[] = pdf.splitTextToSize(product.nombre, pageW - margin * 4);
          const displayLines = nameLines.slice(0, 3);
          const nameLH = config.poster_tamañoNombre * 0.5;
          for (let li = 0; li < displayLines.length; li++) {
            pdf.text(String(displayLines[li]), pageW / 2, nameY + li * nameLH, { align: "center" });
          }

          // ── Price section ──
          const footerY = pageH - 25;
          const priceY = footerY - 35;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.poster_tamañoPrecio);
          pdf.setTextColor(0);
          const mainPrice = hasUnits ? boxPrice : displayPrice;
          pdf.text(String(`${formatCurrency(mainPrice)}`), pageW / 2, priceY, { align: "center" });

          if (config.poster_mostrarPrecioUnitario && hasUnits) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(14);
            pdf.setTextColor(100);
            pdf.text(String(`${formatCurrency(displayPrice)} Final c/u`), pageW / 2, priceY + 12, { align: "center" });
            pdf.setTextColor(0);
          }

          // ── Footer: line + web text + QR ──
          pdf.setDrawColor(200);
          pdf.setLineWidth(0.3);
          pdf.line(margin + 10, footerY, pageW - margin - 10, footerY);

          if (config.poster_mostrarWeb) {
            const qrSize = 18;
            const footerTextY = footerY + 12;

            if (qrDataUrl) {
              // QR on the right
              const qrX = pageW - margin - 10 - qrSize;
              const qrY = footerY + 2;
              try { pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize); } catch {}
              // Text centered in remaining space
              const textAreaW = qrX - margin - 10;
              const textCenterX = margin + 10 + textAreaW / 2;
              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(10);
              pdf.setTextColor(120);
              pdf.text("Mirá todos nuestros productos en nuestra web:", textCenterX, footerTextY, { align: "center" });
              pdf.setFont("helvetica", "bold");
              pdf.setFontSize(11);
              pdf.text(config.webUrl, textCenterX, footerTextY + 6, { align: "center" });
            } else {
              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(11);
              pdf.setTextColor(120);
              pdf.text(`Mirá todos nuestros productos en nuestra web: ${config.webUrl}`, pageW / 2, footerTextY, { align: "center" });
            }
            pdf.setTextColor(0);
          }
        });
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

        // Column positions (right-aligned prices)
        const colUnidad = rm - 52;
        const colCaja = rm - 22;
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
            // Logo
            const logoW = logoBase64 ? 20 : 0;
            if (logoBase64) { try { pdf.addImage(logoBase64, "PNG", lm, 7, logoW, logoW); } catch {} }

            // Title block
            const titleX = logoBase64 ? lm + logoW + 5 : lm;
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(18);
            pdf.setTextColor(40);
            pdf.text("Lista de Precios", titleX, 16);

            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(9);
            pdf.setTextColor(100);
            pdf.text(empresaNombre, titleX, 21.5);

            pdf.setFontSize(7.5);
            pdf.setTextColor(140);
            pdf.text(`${today}  ·  ${selectedProducts.length} productos`, titleX, 26);
            pdf.setTextColor(0);

            // Clean separator
            pdf.setDrawColor(60);
            pdf.setLineWidth(0.5);
            pdf.line(lm, 30, rm, 30);

            return 35;
          } else {
            // Continuation pages: company name + thin line
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(7);
            pdf.setTextColor(150);
            pdf.text(`${empresaNombre} — Lista de Precios`, lm, 7);
            pdf.setTextColor(0);
            pdf.setDrawColor(200);
            pdf.setLineWidth(0.2);
            pdf.line(lm, 9, rm, 9);
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
          pdf.text("ACTUALIZ.", colFecha, ty, { align: "right" });
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
          pdf.text("ACTUALIZ.", colFecha, y + 4.5, { align: "right" });
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
          selectedProducts.forEach((p) => {
            yPos = checkPage(yPos);
            yPos = drawProduct(p, yPos);
          });
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
        const fmtP2 = (v: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(v);

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
        setGenerating(false);
        return;
      }

      if (style === "gondola") {
        // Landscape A4: 297×210mm — grid of shelf labels
        const cols = 3;
        const rows = 6;
        const perPage = cols * rows; // 18 labels per page
        const cellW = (pageW - margin * 2) / cols;
        const cellH = (pageH - margin * 2) / rows;
        const pad = 2.5;

        selectedProducts.forEach((product, idx) => {
          if (idx > 0 && idx % perPage === 0) pdf.addPage();
          const posInPage = idx % perPage;
          const col = posInPage % cols;
          const row = Math.floor(posInPage / cols);
          const x = margin + col * cellW;
          const y = margin + row * cellH;

          const displayPrice = product.enOferta && product.precioOferta > 0 ? product.precioOferta : product.precioUnitario;
          const boxPrice = product.enOferta && product.cajaEnOferta && product.precioOfertaCaja > 0 ? product.precioOfertaCaja : product.precioCaja;
          const hasBox = product.unidadesCaja > 0 && boxPrice > 0;

          // ── Cell border (dashed cut lines) ──
          pdf.setDrawColor(180);
          pdf.setLineWidth(0.15);
          pdf.setLineDashPattern([1.5, 1.5], 0);
          pdf.rect(x, y, cellW, cellH);
          pdf.setLineDashPattern([], 0);

          // ── Layout zones ──
          // Top strip: logo + web + date (15%)
          // Name zone: product name (25%)
          // Price zone: big price (35%)
          // Bottom zone: presentation/box info (25%)
          const topH = cellH * 0.15;
          const nameZoneY = y + topH;
          const nameH = cellH * 0.25;
          const priceZoneY = nameZoneY + nameH;
          const priceH = cellH * 0.35;
          const boxZoneY = priceZoneY + priceH;
          const boxH = cellH * 0.25;

          // ── 1. TOP STRIP: logo (left) + web + date (right) ──
          if (logoBase64) {
            const logoH = topH - 2;
            const logoW = logoH * logoAspectRatio;
            try { pdf.addImage(logoBase64, "PNG", x + pad, y + 1, logoW, logoH); } catch {}
          }
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(6.5);
          pdf.setTextColor(120);
          if (config.webUrl) {
            pdf.text(config.webUrl, x + cellW - pad, y + topH * 0.45, { align: "right" });
          }
          const prodDate = product.fechaActualizacion
            ? new Date(product.fechaActualizacion).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
            : today;
          pdf.setFontSize(6);
          pdf.text(prodDate, x + cellW - pad, y + topH * 0.82, { align: "right" });
          pdf.setTextColor(0);

          // Separator after top strip
          pdf.setDrawColor(200);
          pdf.setLineWidth(0.2);
          pdf.line(x + pad, y + topH, x + cellW - pad, y + topH);

          // ── 2. PRODUCT NAME (centered, bold, up to 2 lines) ──
          const nameMaxW = cellW - pad * 2;
          let nameFontSize = 11;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(nameFontSize);
          let nameLines: string[] = pdf.splitTextToSize(product.nombre, nameMaxW);
          const minNameFont = 7;
          while (nameLines.length > 2 && nameFontSize > minNameFont) {
            nameFontSize -= 0.5;
            pdf.setFontSize(nameFontSize);
            nameLines = pdf.splitTextToSize(product.nombre, nameMaxW);
          }
          const nameLineH = nameFontSize * 0.45;
          const maxNameLines = Math.min(nameLines.length, 2);
          const totalNameTextH = maxNameLines * nameLineH;
          const nameStartY = nameZoneY + (nameH - totalNameTextH) / 2 + nameLineH * 0.7;
          for (let li = 0; li < maxNameLines; li++) {
            let lineText = String(nameLines[li]);
            if (li === maxNameLines - 1 && nameLines.length > maxNameLines) {
              while (pdf.getTextWidth(lineText + "...") > nameMaxW && lineText.length > 0) lineText = lineText.slice(0, -1);
              lineText += "...";
            }
            pdf.text(lineText, x + cellW / 2, nameStartY + li * nameLineH, { align: "center" });
          }

          // ── 3. PRICE ZONE ──
          // Background highlight
          pdf.setFillColor(242, 242, 242);
          pdf.rect(x + 0.15, priceZoneY, cellW - 0.3, priceH, "F");

          // Big price (centered, large)
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(26);
          pdf.setTextColor(0);
          const priceText = formatCurrency(displayPrice);
          const priceCenterY = priceZoneY + priceH * 0.55;
          pdf.text(priceText, x + cellW / 2, priceCenterY, { align: "center" });

          // ── 4. PRESENTATION / BOX INFO ──
          if (hasBox) {
            // Separator
            pdf.setDrawColor(200);
            pdf.setLineWidth(0.2);
            pdf.line(x + pad, boxZoneY, x + cellW - pad, boxZoneY);

            // Left: presentation label
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(9);
            pdf.setTextColor(60);
            const presLabel = `${product.nombrePresentacion} x${product.unidadesCaja}`;
            pdf.text(presLabel, x + pad + 1, boxZoneY + boxH * 0.45);

            // Right: box price (big)
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(13);
            pdf.setTextColor(0);
            pdf.text(formatCurrency(boxPrice), x + cellW - pad - 1, boxZoneY + boxH * 0.45, { align: "right" });

            // Unit price within box
            const unitInBox = boxPrice / product.unidadesCaja;
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(7);
            pdf.setTextColor(100);
            pdf.text(`(${formatCurrency(unitInBox)} c/u)`, x + cellW - pad - 1, boxZoneY + boxH * 0.82, { align: "right" });
            pdf.setTextColor(0);
          }
        });
      }

      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
      setShowPreview(true);
      setGenerating(false);
    }, 100);
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
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Modificado desde</label>
                  <input type="date" value={filters.fechaDesde} onChange={(e) => updateFilter("fechaDesde", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Modificado hasta</label>
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
                    <option value="modificacion">Últ. modificación</option>
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
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col border border-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <h2 className="text-lg font-semibold">Elegí el estilo del PDF</h2>
              <button onClick={() => setShowStylePicker(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-5 gap-4 max-w-6xl mx-auto overflow-y-auto">
              {/* Carteles de precios */}
              <button onClick={() => generatePDF("combinado")} className="group border-2 border-border rounded-xl p-4 hover:border-primary transition-all text-left">
                <div className="border border-border rounded-lg p-3 mb-3 bg-accent/30">
                  <div className="flex justify-between items-start mb-1">
                    <div className="w-3 h-3 bg-muted-foreground/30 rounded-sm"></div>
                    <span className="text-[4px] text-muted-foreground">MARCA</span>
                  </div>
                  <div className="text-center">
                    <p className="text-[6px] font-bold leading-tight">Producto Ejemplo</p>
                    <p className="text-[10px] font-bold my-0.5">$1.200,00</p>
                  </div>
                  <div className="border-t border-border mt-1 pt-1">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-[4px] text-muted-foreground">Efect.</p>
                        <p className="text-[6px] font-bold">$1.200,00</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[4px] text-muted-foreground">Caja x12</p>
                        <p className="text-[5px] font-bold text-muted-foreground">$14.400</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-0.5">
                      <div>
                        <p className="text-[4px] text-muted-foreground">Transf.</p>
                        <p className="text-[6px] font-bold text-muted-foreground">$1.224,00</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[5px] font-bold text-muted-foreground">$14.688</p>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-border mt-1 pt-0.5 flex justify-between">
                    <span className="text-[4px] text-muted-foreground">www.dulcesur.com</span>
                    <span className="text-[4px] text-muted-foreground">20/3/2026</span>
                  </div>
                </div>
                <p className="font-semibold text-sm">Carteles de precios</p>
                <p className="text-xs text-muted-foreground mt-0.5">Precio grande + detalle Efec/Transf. + Caja</p>
              </button>

              {/* Duo — Unidad + Caja */}
              <button onClick={() => generatePDF("duo")} className="group border-2 border-border rounded-xl p-4 hover:border-primary transition-all text-left">
                <div className="border border-border rounded-lg p-3 mb-3 bg-accent/30">
                  <div className="flex justify-between items-start mb-1">
                    <div className="w-3 h-3 bg-muted-foreground/30 rounded-sm"></div>
                    <span className="text-[4px] text-muted-foreground">MARCA</span>
                  </div>
                  <p className="text-[6px] font-bold text-center leading-tight mb-1">Producto Ejemplo</p>
                  <div className="flex gap-0.5">
                    <div className="flex-1 text-center border-r border-border pr-0.5">
                      <p className="text-[4px] font-bold text-muted-foreground">UNIDAD</p>
                      <p className="text-[9px] font-bold">$1.200</p>
                      <p className="text-[4px] text-muted-foreground">Transf. $1.224</p>
                    </div>
                    <div className="flex-1 text-center bg-muted/50 rounded-sm pl-0.5">
                      <p className="text-[4px] font-bold text-muted-foreground">CAJA x12</p>
                      <p className="text-[9px] font-bold">$14.400</p>
                      <p className="text-[4px] text-muted-foreground">Transf. $14.688</p>
                    </div>
                  </div>
                  <div className="border-t border-border mt-1 pt-0.5 flex justify-between">
                    <span className="text-[4px] text-muted-foreground">www.dulcesur.com</span>
                    <span className="text-[4px] text-muted-foreground">30/3/2026</span>
                  </div>
                </div>
                <p className="font-semibold text-sm">Cartel Unidad + Caja</p>
                <p className="text-xs text-muted-foreground mt-0.5">Dos columnas: precio unitario y por caja, ambos visibles</p>
              </button>

              {/* Simple — Precio + Caja */}
              <button onClick={() => generatePDF("simple")} className="group border-2 border-border rounded-xl p-4 hover:border-primary transition-all text-left">
                <div className="border border-border rounded-lg p-3 mb-3 bg-accent/30">
                  <div className="flex justify-between items-start mb-1">
                    <div className="w-3 h-3 bg-muted-foreground/30 rounded-sm"></div>
                    <span className="text-[4px] text-muted-foreground">MARCA</span>
                  </div>
                  <p className="text-[6px] font-bold text-center leading-tight mb-0.5">Producto Ejemplo</p>
                  <p className="text-[10px] font-bold text-center mb-1">$1.200</p>
                  <div className="bg-muted/60 rounded-sm px-1 py-0.5 flex justify-between items-center">
                    <span className="text-[5px] font-bold text-muted-foreground">Caja x12</span>
                    <span className="text-[7px] font-bold">$14.400</span>
                  </div>
                  <div className="border-t border-border mt-1 pt-0.5 flex justify-between">
                    <span className="text-[4px] text-muted-foreground">www.dulcesur.com</span>
                    <span className="text-[4px] text-muted-foreground">30/3/2026</span>
                  </div>
                </div>
                <p className="font-semibold text-sm">Precio + Caja</p>
                <p className="text-xs text-muted-foreground mt-0.5">Precio unitario grande + banda con precio por caja</p>
              </button>

              {/* Poster */}
              <button onClick={() => generatePDF("poster")} className="group border-2 border-border rounded-xl p-4 hover:border-primary transition-all text-left">
                <div className="border border-border rounded-lg p-3 mb-3 bg-accent/30">
                  <div className="flex items-start justify-between mb-1">
                    <div className="w-4 h-3 bg-muted-foreground/30 rounded-sm"></div>
                  </div>
                  <div className="text-center">
                    <p className="text-[6px] font-bold italic underline mb-1">OFERTA</p>
                    <p className="text-[7px] font-bold leading-tight">Producto Ejemplo x36</p>
                    <p className="text-[14px] font-bold mt-1">$30.240</p>
                    <p className="text-[4px] text-muted-foreground mt-0.5">$840,00 Final c/u</p>
                  </div>
                </div>
                <p className="font-semibold text-sm">Poster</p>
                <p className="text-xs text-muted-foreground mt-0.5">Página completa A4</p>
              </button>

              {/* Góndola — Carteles para estantes */}
              <button onClick={() => generatePDF("gondola")} className="group border-2 border-border rounded-xl p-4 hover:border-primary transition-all text-left">
                <div className="border border-border rounded-lg p-3 mb-3 bg-accent/30">
                  <div className="flex justify-between items-center mb-0.5">
                    <div className="w-3 h-2 bg-muted-foreground/30 rounded-sm"></div>
                    <span className="text-[3px] text-muted-foreground">web | 4/4/26</span>
                  </div>
                  <div className="border-t border-border pt-0.5">
                    <p className="text-[5px] font-bold text-center leading-tight">Producto Ejemplo 200g</p>
                  </div>
                  <div className="bg-muted/40 rounded-sm py-1 my-0.5">
                    <p className="text-[11px] font-bold text-center leading-none">$1.200</p>
                    <p className="text-[4px] text-muted-foreground text-center">Transf. $1.224</p>
                  </div>
                  <div className="border-t border-border pt-0.5 flex justify-between items-center">
                    <span className="text-[4px] font-bold text-muted-foreground">Caja x12</span>
                    <div className="text-right">
                      <span className="text-[5px] font-bold">$14.400</span>
                      <span className="text-[3px] text-muted-foreground ml-0.5">($1.200 c/u)</span>
                    </div>
                  </div>
                </div>
                <p className="font-semibold text-sm">Carteles de góndola</p>
                <p className="text-xs text-muted-foreground mt-0.5">24 etiquetas por hoja A4 apaisada, con presentación y precio transf.</p>
              </button>

              {/* Lista General */}
              <div className="col-span-5 border-2 border-border rounded-xl p-4 space-y-3">
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
              <div className="col-span-5 border-2 border-border rounded-xl p-4 space-y-3">
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
              {(["general", "combinado", "duo", "poster"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setConfigTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    configTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "combinado" ? "Carteles" : tab === "duo" ? "Unidad + Caja" : tab === "general" ? "General" : "Poster"}
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

              {configTab === "poster" && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Tamaños de fuente</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Nombre (pt)</label>
                        <input type="number" min={16} max={60} value={config.poster_tamañoNombre} onChange={(e) => updateConfig("poster_tamañoNombre", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Precio (pt)</label>
                        <input type="number" min={24} max={120} value={config.poster_tamañoPrecio} onChange={(e) => updateConfig("poster_tamañoPrecio", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Elementos visibles</h3>
                    <div className="space-y-3">
                      <ToggleSwitch checked={config.poster_mostrarLogo} onChange={() => updateConfig("poster_mostrarLogo", !config.poster_mostrarLogo)} label="Logo" />
                      <ToggleSwitch checked={config.poster_mostrarWeb} onChange={() => updateConfig("poster_mostrarWeb", !config.poster_mostrarWeb)} label="Página web" />
                      <ToggleSwitch checked={config.poster_mostrarPrecioUnitario} onChange={() => updateConfig("poster_mostrarPrecioUnitario", !config.poster_mostrarPrecioUnitario)} label="Precio unitario (Final c/u)" />
                    </div>
                  </div>
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
