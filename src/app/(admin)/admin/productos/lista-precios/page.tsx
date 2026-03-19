"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { jsPDF } from "jspdf";
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
  hayStock: boolean;
  aumento: boolean;
  id: string;
  categoria: string;
  subcategoria: string;
  fechaActualizacion: string;
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
  aumento: string;
}

interface PdfConfig {
  porcentajeTransferencia: number;
  webUrl: string;
  logoTamaño: number;
  cartel_columnas: number;
  cartel_filas: number;
  cartel_tamañoNombre: number;
  cartel_tamañoPrecio: number;
  cartel_tamañoTransferencia: number;
  cartel_mostrarTransferencia: boolean;
  cartel_mostrarPrecioCaja: boolean;
  cartel_mostrarLogo: boolean;
  cartel_mostrarWeb: boolean;
  cartel_mostrarFecha: boolean;
  lista_columnas: number;
  lista_filas: number;
  lista_tamañoNombre: number;
  lista_tamañoPrecioGrande: number;
  lista_tamañoPrecioChico: number;
  lista_mostrarCaja: boolean;
  lista_mostrarFecha: boolean;
  combinado_columnas: number;
  combinado_filas: number;
  combinado_tamañoNombre: number;
  combinado_tamañoPrecio: number;
  combinado_mostrarPrecioCaja: boolean;
  combinado_mostrarLogo: boolean;
  combinado_mostrarWeb: boolean;
  combinado_mostrarFecha: boolean;
  oferta_columnas: number;
  oferta_filas: number;
  oferta_tamañoNombre: number;
  oferta_tamañoPrecioOferta: number;
  oferta_tamañoPrecioOriginal: number;
  oferta_mostrarPrecioCaja: boolean;
  oferta_mostrarLogo: boolean;
  oferta_mostrarWeb: boolean;
  oferta_mostrarFecha: boolean;
  poster_tamañoNombre: number;
  poster_tamañoPrecio: number;
  poster_mostrarLogo: boolean;
  poster_mostrarWeb: boolean;
  poster_mostrarPrecioUnitario: boolean;
}

type PdfStyle = "cartel" | "lista" | "combinado" | "oferta" | "poster";
type ConfigTab = "general" | PdfStyle;

const DEFAULT_FILTERS: Filters = { search: "", categoria: "", subcategoria: "", marca: "", enOferta: "", cajaEnOferta: "", precioPorCaja: "", hayStock: "", aumento: "" };

const DEFAULT_CONFIG: PdfConfig = {
  porcentajeTransferencia: 2,
  webUrl: "www.dulcesur.com",
  logoTamaño: 8,
  cartel_columnas: 3, cartel_filas: 4, cartel_tamañoNombre: 10, cartel_tamañoPrecio: 28, cartel_tamañoTransferencia: 14,
  cartel_mostrarTransferencia: true, cartel_mostrarPrecioCaja: true, cartel_mostrarLogo: true, cartel_mostrarWeb: true, cartel_mostrarFecha: true,
  lista_columnas: 3, lista_filas: 4, lista_tamañoNombre: 9, lista_tamañoPrecioGrande: 14, lista_tamañoPrecioChico: 9,
  lista_mostrarCaja: true, lista_mostrarFecha: true,
  combinado_columnas: 3, combinado_filas: 3, combinado_tamañoNombre: 9, combinado_tamañoPrecio: 22,
  combinado_mostrarPrecioCaja: true, combinado_mostrarLogo: true, combinado_mostrarWeb: true, combinado_mostrarFecha: true,
  oferta_columnas: 3, oferta_filas: 4, oferta_tamañoNombre: 10, oferta_tamañoPrecioOferta: 26, oferta_tamañoPrecioOriginal: 12,
  oferta_mostrarPrecioCaja: true, oferta_mostrarLogo: true, oferta_mostrarWeb: true, oferta_mostrarFecha: true,
  poster_tamañoNombre: 36, poster_tamañoPrecio: 72, poster_mostrarLogo: true, poster_mostrarWeb: true, poster_mostrarPrecioUnitario: true,
};

function formatPrice(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(n);
}

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
  const [page, setPage] = useState(1);
  const [config, setConfig] = useState<PdfConfig>(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [configTab, setConfigTab] = useState<ConfigTab>("general");
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const itemsPerPage = 50;

  // Load config and logo from localStorage on mount
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem("listaPreciosConfig");
      if (savedConfig) setConfig(JSON.parse(savedConfig));
      const savedLogo = localStorage.getItem("listaPreciosLogo");
      if (savedLogo) setLogoBase64(savedLogo);
    } catch {}
  }, []);

  // Save config to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem("listaPreciosConfig", JSON.stringify(config));
    } catch {}
  }, [config]);

  // Save logo to localStorage on change
  useEffect(() => {
    try {
      if (logoBase64) {
        localStorage.setItem("listaPreciosLogo", logoBase64);
      } else {
        localStorage.removeItem("listaPreciosLogo");
      }
    } catch {}
  }, [logoBase64]);

  // Fetch products from Supabase
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const { data: dbProducts } = await supabase
      .from("productos")
      .select("*, categorias(nombre), marcas(nombre)")
      .eq("activo", true)
      .order("nombre");

    const { data: presentaciones } = await supabase
      .from("presentaciones")
      .select("*");

    const presMap = new Map<string, DBPresentacion[]>();
    (presentaciones || []).forEach((p: DBPresentacion) => {
      const arr = presMap.get(p.producto_id) || [];
      arr.push(p);
      presMap.set(p.producto_id, arr);
    });

    const mapped: Product[] = (dbProducts || []).map((p: DBProducto) => {
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

      // Detect recent price modification (last 7 days)
      const fechaAct = p.fecha_actualizacion || "";
      const isRecent = fechaAct ? (Date.now() - new Date(fechaAct).getTime()) < 7 * 24 * 60 * 60 * 1000 : false;

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
        hayStock: p.stock > 0,
        aumento: isRecent,
        id: p.id,
        categoria: dbCategoria || clasificacion.categoria,
        subcategoria: clasificacion.subcategoria,
        fechaActualizacion: fechaAct,
      };
    });

    setProducts(mapped);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

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
    if (filters.aumento) c++;
    return c;
  }, [filters]);

  const marcas = useMemo(() => [...new Set(products.map((p) => p.marca).filter(Boolean))].sort(), [products]);
  const categorias = useMemo(() => [...new Set(products.map((p) => p.categoria).filter(Boolean))].sort(), [products]);
  const subcategorias = useMemo(() => {
    const prods = filters.categoria ? products.filter((p) => p.categoria === filters.categoria) : products;
    return [...new Set(prods.map((p) => p.subcategoria).filter(Boolean))].sort();
  }, [products, filters.categoria]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (filters.search && !p.nombre.toLowerCase().includes(filters.search.toLowerCase())) return false;
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
      if (filters.aumento === "si" && !p.aumento) return false;
      if (filters.aumento === "no" && p.aumento) return false;
      return true;
    });
  }, [products, filters]);

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

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoBase64(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleGenerateClick = () => setShowStylePicker(true);

  // ─── PDF Generation ───
  const generatePDF = (style: PdfStyle) => {
    setShowStylePicker(false);
    setGenerating(true);

    setTimeout(() => {
      const selectedProducts = products.filter((_, i) => selected.has(i));
      if (selectedProducts.length === 0) { setGenerating(false); return; }

      const isLandscape = style === "poster";
      const pdf = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 5;
      const today = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

      if (style === "cartel") {
        const cols = config.cartel_columnas;
        const rows = config.cartel_filas;
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
          const pad = 2;

          pdf.setDrawColor(200);
          pdf.setLineWidth(0.3);
          pdf.rect(x, y, cellW, cellH);

          if (config.cartel_mostrarLogo && logoBase64) {
            try { pdf.addImage(logoBase64, "PNG", x + pad, y + pad, config.logoTamaño, config.logoTamaño); } catch {}
          }

          const displayPrice = product.enOferta && product.precioOferta > 0 ? product.precioOferta : product.precioUnitario;
          const transferPrice = displayPrice * (1 + config.porcentajeTransferencia / 100);
          const boxPrice = product.enOferta && product.cajaEnOferta && product.precioOfertaCaja > 0 ? product.precioOfertaCaja : product.precioCaja;
          const hasUnits = product.unidadesCaja > 0;

          // Product name
          const nameMaxW = cellW - pad * 2;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.cartel_tamañoNombre);
          const nameLines: string[] = pdf.splitTextToSize(product.nombre, nameMaxW);
          const nameY = y + (config.cartel_mostrarLogo && logoBase64 ? config.logoTamaño + pad + 4 : pad + 4);
          for (let li = 0; li < Math.min(nameLines.length, 2); li++) {
            pdf.text(String(nameLines[li]), x + cellW / 2, nameY + li * (config.cartel_tamañoNombre * 0.45), { align: "center" });
          }

          if (config.cartel_mostrarPrecioCaja && hasUnits) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(7);
            pdf.setTextColor(120);
            pdf.text(`Caja x${product.unidadesCaja} unidades`, x + cellW / 2, nameY + Math.min(nameLines.length, 2) * (config.cartel_tamañoNombre * 0.45) + 2, { align: "center" });
            pdf.setTextColor(0);
          }

          // Main price
          const priceY = y + cellH * 0.55;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.cartel_tamañoPrecio);
          pdf.text(`${formatPrice(displayPrice)}`, x + cellW / 2, priceY, { align: "center" });

          // Transfer price
          if (config.cartel_mostrarTransferencia) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(7);
            pdf.setTextColor(120);
            pdf.text("Transferencia", x + cellW / 2, priceY + 6, { align: "center" });
            pdf.setTextColor(0);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(config.cartel_tamañoTransferencia);
            pdf.text(`${formatPrice(transferPrice)}`, x + cellW / 2, priceY + 12, { align: "center" });
          }

          // Box price
          if (config.cartel_mostrarPrecioCaja && hasUnits && boxPrice > 0) {
            const bpY = priceY + (config.cartel_mostrarTransferencia ? 19 : 8);
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(7);
            pdf.setTextColor(120);
            pdf.text(`Caja x${product.unidadesCaja}`, x + cellW / 2, bpY, { align: "center" });
            pdf.setTextColor(0);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(11);
            pdf.text(`${formatPrice(boxPrice)}`, x + cellW / 2, bpY + 4, { align: "center" });
          }

          // Footer
          const footerY = y + cellH - pad - 1;
          pdf.setDrawColor(220);
          pdf.setLineWidth(0.2);
          pdf.line(x + pad, footerY - 3, x + cellW - pad, footerY - 3);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5);
          pdf.setTextColor(150);
          if (config.cartel_mostrarWeb) pdf.text(config.webUrl, x + pad + 1, footerY);
          if (config.cartel_mostrarFecha) pdf.text(today, x + cellW - pad - 1, footerY, { align: "right" });
          pdf.setTextColor(0);
        });
      }

      if (style === "lista") {
        const cols = config.lista_columnas;
        const rows = config.lista_filas;
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
          const hasUnits = product.unidadesCaja > 0;

          // Name
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.lista_tamañoNombre);
          const nameMaxW = cellW - pad * 2;
          const nameLines: string[] = pdf.splitTextToSize(product.nombre.toUpperCase() + (hasUnits ? ` x${product.unidadesCaja}` : ""), nameMaxW);
          let curY = y + pad + 3;
          for (let li = 0; li < Math.min(nameLines.length, 2); li++) {
            pdf.text(String(nameLines[li]), x + pad, curY + li * (config.lista_tamañoNombre * 0.45));
          }
          curY += Math.min(nameLines.length, 2) * (config.lista_tamañoNombre * 0.45) + 1;

          pdf.setDrawColor(220);
          pdf.setLineWidth(0.2);
          pdf.line(x + pad, curY, x + cellW - pad, curY);
          curY += 2;

          // EFEC row
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(6);
          pdf.setTextColor(140);
          pdf.text("EFEC", x + pad, curY);
          pdf.setTextColor(0);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.lista_tamañoPrecioGrande);
          pdf.text(`${formatPrice(displayPrice)}`, x + pad, curY + 5);

          if (config.lista_mostrarCaja && hasUnits && boxPrice > 0) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(6);
            pdf.setTextColor(140);
            pdf.text(`x${product.unidadesCaja}`, x + cellW - pad, curY, { align: "right" });
            pdf.setTextColor(0);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(config.lista_tamañoPrecioChico);
            pdf.text(`${formatPrice(boxPrice)}`, x + cellW - pad, curY + 5, { align: "right" });
          }

          curY += 8;

          // TRANSF row
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(6);
          pdf.setTextColor(140);
          pdf.text("TRANSFERENCIA", x + pad, curY);
          pdf.setTextColor(0);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.lista_tamañoPrecioGrande);
          pdf.text(`${formatPrice(transferPrice)}`, x + pad, curY + 5);

          if (config.lista_mostrarCaja && hasUnits && boxPrice > 0) {
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(config.lista_tamañoPrecioChico);
            pdf.text(`${formatPrice(transferBox)}`, x + cellW - pad, curY + 5, { align: "right" });
          }

          // Footer
          if (config.lista_mostrarFecha) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(5);
            pdf.setTextColor(150);
            pdf.text(`Fecha Modificación: ${today}`, x + cellW / 2, y + cellH - pad, { align: "center" });
            pdf.setTextColor(0);
          }
        });
      }

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

          // Fixed layout zones from top to bottom
          const footerH = 8; // reserved for footer line + web/date
          const logoSize = config.combinado_mostrarLogo && logoBase64 ? Math.min(config.logoTamaño, cellH * 0.12) : 0;

          let curY = y + pad;

          // Logo (top-left, object-contain: square constrained)
          if (config.combinado_mostrarLogo && logoBase64) {
            try { pdf.addImage(logoBase64, "PNG", x + pad, curY, logoSize, logoSize); } catch {}
          }

          // Marca (top-left, next to or below logo)
          if (product.marca) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(5);
            pdf.setTextColor(130);
            const marcaX = logoSize > 0 ? x + pad + logoSize + 1.5 : x + pad;
            const marcaY = logoSize > 0 ? y + pad + 3 : curY + 3;
            pdf.text(product.marca.toUpperCase(), marcaX, marcaY);
            pdf.setTextColor(0);
          }

          curY += Math.max(logoSize, 2) + 2;

          // Product name - truncate to max 2 lines
          const displayPrice = product.enOferta && product.precioOferta > 0 ? product.precioOferta : product.precioUnitario;
          const transferPrice = displayPrice * (1 + config.porcentajeTransferencia / 100);
          const boxPrice = product.enOferta && product.cajaEnOferta && product.precioOfertaCaja > 0 ? product.precioOfertaCaja : product.precioCaja;
          const transferBox = boxPrice * (1 + config.porcentajeTransferencia / 100);
          const hasUnits = product.unidadesCaja > 0;

          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.combinado_tamañoNombre);
          const nameMaxW = cellW - pad * 2;
          const nameLines: string[] = pdf.splitTextToSize(product.nombre, nameMaxW);
          const nameLineH = config.combinado_tamañoNombre * 0.45;
          const maxNameLines = Math.min(nameLines.length, 2);
          for (let li = 0; li < maxNameLines; li++) {
            let lineText = String(nameLines[li]);
            if (li === 1 && nameLines.length > 2) {
              // Truncate with ellipsis
              while (pdf.getTextWidth(lineText + "...") > nameMaxW && lineText.length > 0) {
                lineText = lineText.slice(0, -1);
              }
              lineText = lineText + "...";
            }
            pdf.text(lineText, x + cellW / 2, curY + li * nameLineH, { align: "center" });
          }
          curY += maxNameLines * nameLineH;

          // Caja info - small text below product name, left-aligned
          if (hasUnits) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(5);
            pdf.setTextColor(120);
            pdf.text(`Caja x${product.unidadesCaja} unidades`, x + pad, curY + 1.5);
            pdf.setTextColor(0);
            curY += 4;
          } else {
            curY += 1;
          }

          // Big price - centered in remaining upper space
          const bigPriceH = config.combinado_tamañoPrecio * 0.4;
          curY += 2;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.combinado_tamañoPrecio);
          pdf.text(formatPrice(displayPrice), x + cellW / 2, curY + bigPriceH, { align: "center" });
          curY += bigPriceH + config.combinado_tamañoPrecio * 0.15 + 2;

          // Divider line
          pdf.setDrawColor(220);
          pdf.setLineWidth(0.2);
          pdf.line(x + pad, curY, x + cellW - pad, curY);
          curY += 3;

          // Detail rows - use remaining space above footer
          const detailEndY = y + cellH - footerH;
          const detailSpace = detailEndY - curY;
          // Each row needs: label line (3mm) + price line (4mm) + gap (2mm) = ~9mm
          const rowH = Math.max(8, Math.min(11, detailSpace / 2));

          // EFEC row
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5.5);
          pdf.setTextColor(140);
          pdf.text("Efect.", x + pad, curY);
          if (config.combinado_mostrarPrecioCaja && hasUnits && boxPrice > 0) {
            pdf.text("Caja", x + cellW - pad, curY, { align: "right" });
          }
          pdf.setTextColor(0);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(Math.min(9, rowH - 2));
          pdf.text(formatPrice(displayPrice), x + pad, curY + 4);
          if (config.combinado_mostrarPrecioCaja && hasUnits && boxPrice > 0) {
            pdf.setFontSize(Math.min(7.5, rowH - 3));
            pdf.text(formatPrice(boxPrice), x + cellW - pad, curY + 4, { align: "right" });
          }

          curY += rowH;

          // TRANSF row
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5.5);
          pdf.setTextColor(140);
          pdf.text("Transf.", x + pad, curY);
          pdf.setTextColor(0);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(Math.min(9, rowH - 2));
          pdf.setTextColor(100);
          pdf.text(formatPrice(transferPrice), x + pad, curY + 4);
          if (config.combinado_mostrarPrecioCaja && hasUnits && boxPrice > 0) {
            pdf.setFontSize(Math.min(7.5, rowH - 3));
            pdf.text(formatPrice(transferBox), x + cellW - pad, curY + 4, { align: "right" });
          }
          pdf.setTextColor(0);

          // Footer - fixed at bottom
          const footerY = y + cellH - pad;
          pdf.setDrawColor(220);
          pdf.setLineWidth(0.2);
          pdf.line(x + pad, footerY - 4, x + cellW - pad, footerY - 4);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5);
          pdf.setTextColor(150);
          if (config.combinado_mostrarWeb) pdf.text(config.webUrl, x + pad + 1, footerY - 1);
          if (config.combinado_mostrarFecha) pdf.text(today, x + cellW - pad - 1, footerY - 1, { align: "right" });
          pdf.setTextColor(0);
        });
      }

      if (style === "oferta") {
        const cols = config.oferta_columnas;
        const rows = config.oferta_filas;
        const perPage = cols * rows;
        const cellW = (pageW - margin * 2) / cols;
        const cellH = (pageH - margin * 2) / rows;

        const ofertaProducts = selectedProducts.filter((p) => p.enOferta);
        const toRender = ofertaProducts.length > 0 ? ofertaProducts : selectedProducts;

        toRender.forEach((product, idx) => {
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

          if (config.oferta_mostrarLogo && logoBase64) {
            try { pdf.addImage(logoBase64, "PNG", x + pad, y + pad, config.logoTamaño, config.logoTamaño); } catch {}
          }

          // OFERTA badge
          const badgeW = 18;
          const badgeH = 5;
          const badgeX = x + cellW - pad - badgeW;
          const badgeY = y + pad;
          pdf.setFillColor(220, 38, 38);
          pdf.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, "F");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7);
          pdf.setTextColor(255, 255, 255);
          pdf.text("OFERTA", badgeX + badgeW / 2, badgeY + 3.5, { align: "center" });
          pdf.setTextColor(0);

          const displayPrice = product.precioUnitario;
          const offerPrice = product.precioOferta > 0 ? product.precioOferta : product.precioUnitario;
          const hasUnits = product.unidadesCaja > 0;

          // Name
          const nameY = y + pad + 12;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.oferta_tamañoNombre);
          const nameLines: string[] = pdf.splitTextToSize(product.nombre, cellW - pad * 2);
          for (let li = 0; li < Math.min(nameLines.length, 2); li++) {
            pdf.text(String(nameLines[li]), x + cellW / 2, nameY + li * (config.oferta_tamañoNombre * 0.45), { align: "center" });
          }

          if (config.oferta_mostrarPrecioCaja && hasUnits) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(7);
            pdf.setTextColor(120);
            pdf.text(`Caja x${product.unidadesCaja} unidades`, x + cellW / 2, nameY + Math.min(nameLines.length, 2) * (config.oferta_tamañoNombre * 0.45) + 2, { align: "center" });
            pdf.setTextColor(0);
          }

          // Original price (crossed)
          const origY = y + cellH * 0.55;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(config.oferta_tamañoPrecioOriginal);
          pdf.setTextColor(150);
          const origText = `${formatPrice(displayPrice)}`;
          pdf.text(origText, x + cellW / 2, origY, { align: "center" });
          const origW = pdf.getTextWidth(origText);
          pdf.setDrawColor(150);
          pdf.setLineWidth(0.4);
          pdf.line(x + cellW / 2 - origW / 2, origY - 1, x + cellW / 2 + origW / 2, origY - 1);

          // Offer price
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.oferta_tamañoPrecioOferta);
          pdf.setTextColor(220, 38, 38);
          pdf.text(`${formatPrice(offerPrice)}`, x + cellW / 2, origY + 10, { align: "center" });
          pdf.setTextColor(0);

          // Footer
          const footerY = y + cellH - pad - 1;
          pdf.setDrawColor(220);
          pdf.setLineWidth(0.2);
          pdf.line(x + pad, footerY - 3, x + cellW - pad, footerY - 3);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5);
          pdf.setTextColor(150);
          if (config.oferta_mostrarWeb) pdf.text(config.webUrl, x + pad + 1, footerY);
          if (config.oferta_mostrarFecha) pdf.text(today, x + cellW - pad - 1, footerY, { align: "right" });
          pdf.setTextColor(0);
        });
      }

      if (style === "poster") {
        selectedProducts.forEach((product, idx) => {
          if (idx > 0) pdf.addPage();
          const displayPrice = product.enOferta && product.precioOferta > 0 ? product.precioOferta : product.precioUnitario;
          const boxPrice = product.precioCaja > 0 ? product.precioCaja : 0;
          const hasUnits = product.unidadesCaja > 0;

          if (config.poster_mostrarLogo && logoBase64) {
            try { pdf.addImage(logoBase64, "PNG", margin + 3, margin + 3, config.logoTamaño * 1.5, config.logoTamaño * 1.5); } catch {}
          }

          // "OFERTA" header
          const ofertaY = 85;
          pdf.setFont("helvetica", "bolditalic");
          pdf.setFontSize(32);
          pdf.setTextColor(0);
          pdf.text("OFERTA", pageW / 2, ofertaY, { align: "center" });
          const ofertaW = pdf.getTextWidth("OFERTA");
          pdf.setDrawColor(0);
          pdf.setLineWidth(0.8);
          pdf.line(pageW / 2 - ofertaW / 2, ofertaY + 1.5, pageW / 2 + ofertaW / 2, ofertaY + 1.5);

          // Product name
          const nameY = 115;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.poster_tamañoNombre);
          const nameLines: string[] = pdf.splitTextToSize(product.nombre, pageW - margin * 2);
          const displayLines = nameLines.slice(0, 3);
          const nameLH = config.poster_tamañoNombre * 0.5;
          for (let li = 0; li < displayLines.length; li++) {
            pdf.text(String(displayLines[li]), pageW / 2, nameY + li * nameLH, { align: "center" });
          }

          const footerY = pageH - 25;
          const priceY = footerY - 45;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(config.poster_tamañoPrecio);
          pdf.setTextColor(0);
          const mainPrice = hasUnits ? boxPrice : displayPrice;
          pdf.text(String(`${formatPrice(mainPrice)}`), pageW / 2, priceY, { align: "center" });

          if (config.poster_mostrarPrecioUnitario && hasUnits) {
            const mainPriceW = pdf.getTextWidth(`${formatPrice(mainPrice)}`);
            const unitX = pageW / 2 + mainPriceW / 2 + 3;
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(14);
            pdf.text(String(`${formatPrice(displayPrice)} Final c/u`), unitX, priceY);
          }

          pdf.setDrawColor(180);
          pdf.setLineWidth(0.3);
          pdf.line(margin, footerY, pageW - margin, footerY);

          if (config.poster_mostrarWeb) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(11);
            pdf.setTextColor(100);
            pdf.text(`Mira todos nuestros productos en nuestra página web: ${config.webUrl}`, pageW / 2, footerY + 10, { align: "center" });
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
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Lista de Precios</h1>
              <p className="text-sm text-muted-foreground">{products.length} productos cargados desde la base de datos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchProducts} className="border border-border text-muted-foreground px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-accent transition-colors flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Actualizar
            </button>
            <button onClick={() => setShowConfig(true)} className="border border-border text-muted-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-accent transition-colors flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Configuración
            </button>
            {selected.size > 0 && (
              <button
                onClick={handleGenerateClick}
                disabled={generating}
                className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Generar PDF ({selected.size})
              </button>
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Categoria</label>
                  <select value={filters.categoria} onChange={(e) => { updateFilter("categoria", e.target.value); updateFilter("subcategoria", ""); }} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Todas</option>
                    {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Subcategoria</label>
                  <select value={filters.subcategoria} onChange={(e) => updateFilter("subcategoria", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Todas</option>
                    {subcategorias.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Marca</label>
                  <select value={filters.marca} onChange={(e) => updateFilter("marca", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Todas</option>
                    {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Toggle label="En oferta" value={filters.enOferta} onChange={(v) => updateFilter("enOferta", v)} />
                <Toggle label="Caja en oferta" value={filters.cajaEnOferta} onChange={(v) => updateFilter("cajaEnOferta", v)} />
                <Toggle label="Precio por caja" value={filters.precioPorCaja} onChange={(v) => updateFilter("precioPorCaja", v)} />
                <Toggle label="Hay stock" value={filters.hayStock} onChange={(v) => updateFilter("hayStock", v)} />
                <Toggle label="Aumento" value={filters.aumento} onChange={(v) => updateFilter("aumento", v)} />
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
                <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">P. Unit.</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">P. Caja</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Oferta</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">P. Oferta</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Uds/Caja</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Stock</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha mod.</th>
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
                      <span className="text-muted-foreground/50 text-xs block">{p.subcategoria}</span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{p.marca}</td>
                    <td className="px-3 py-3 text-right font-mono">{formatPrice(p.precioUnitario)}</td>
                    <td className="px-3 py-3 text-right font-mono text-muted-foreground">{p.precioCaja > 0 ? `${formatPrice(p.precioCaja)}` : "—"}</td>
                    <td className="px-3 py-3 text-center">
                      {p.enOferta ? (
                        <span className="inline-block bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">Sí</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">No</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-muted-foreground">{p.enOferta && p.precioOferta > 0 ? `${formatPrice(p.precioOferta)}` : "—"}</td>
                    <td className="px-3 py-3 text-center text-muted-foreground">{p.unidadesCaja > 0 ? p.unidadesCaja : "—"}</td>
                    <td className="px-3 py-3 text-center">
                      {p.hayStock ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-red-400"></span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-muted-foreground">
                      {p.fechaActualizacion ? new Date(p.fechaActualizacion + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"}
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
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden border border-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold">Elegí el estilo del PDF</h2>
              <button onClick={() => setShowStylePicker(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-5 gap-4">
              {/* Cartel */}
              <button onClick={() => generatePDF("cartel")} className="group border-2 border-border rounded-xl p-4 hover:border-primary transition-all text-left">
                <div className="border border-border rounded-lg p-3 mb-3 bg-accent/30">
                  <div className="text-center space-y-1">
                    <p className="text-[6px] font-bold leading-tight">Producto Ejemplo</p>
                    <p className="text-[5px] text-muted-foreground">Caja x12 unidades</p>
                    <p className="text-xs font-bold">$1.200,00</p>
                    <p className="text-[5px] text-muted-foreground">Transferencia</p>
                    <p className="text-[7px] font-bold text-muted-foreground">$1.224,00</p>
                  </div>
                  <div className="border-t border-border mt-2 pt-1 flex justify-between">
                    <span className="text-[4px] text-muted-foreground">www.dulcesur.com</span>
                    <span className="text-[4px] text-muted-foreground">16/3/2026</span>
                  </div>
                </div>
                <p className="font-semibold text-sm">Cartel de precio</p>
                <p className="text-xs text-muted-foreground mt-0.5">Precio grande, nombre y transferencia</p>
              </button>

              {/* Lista */}
              <button onClick={() => generatePDF("lista")} className="group border-2 border-border rounded-xl p-4 hover:border-primary transition-all text-left">
                <div className="border border-border rounded-lg p-3 mb-3 bg-accent/30 font-mono">
                  <p className="text-[5px] font-bold">PRODUCTO EJEMPLO x20</p>
                  <div className="border-t border-border my-1"></div>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[4px] text-muted-foreground">EFEC</p>
                      <p className="text-[8px] font-bold">$ 48,49</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[4px] text-muted-foreground">x20</p>
                      <p className="text-[6px] font-bold">$ 969,75</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-0.5">
                    <div>
                      <p className="text-[4px] text-muted-foreground">TRANSFERENCIA</p>
                      <p className="text-[8px] font-bold">$ 49,46</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[6px] font-bold">$ 989,14</p>
                    </div>
                  </div>
                </div>
                <p className="font-semibold text-sm">Lista detallada</p>
                <p className="text-xs text-muted-foreground mt-0.5">Efec, Transferencia, precio x caja</p>
              </button>

              {/* Combinado */}
              <button onClick={() => generatePDF("combinado")} className="group border-2 border-border rounded-xl p-4 hover:border-primary transition-all text-left">
                <div className="border border-border rounded-lg p-3 mb-3 bg-accent/30">
                  <div className="text-center">
                    <p className="text-[6px] font-bold leading-tight">Producto Ejemplo</p>
                    <p className="text-[5px] text-muted-foreground">Caja x12 unidades</p>
                    <p className="text-[10px] font-bold my-0.5">$1.200,00</p>
                  </div>
                  <div className="border-t border-border mt-1 pt-1">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-[4px] text-muted-foreground">EFEC</p>
                        <p className="text-[6px] font-bold">$1.200,00</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[4px] text-muted-foreground">Caja x12</p>
                        <p className="text-[5px] font-bold text-muted-foreground">$14.400</p>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="font-semibold text-sm">Combinado</p>
                <p className="text-xs text-muted-foreground mt-0.5">Cartel + detalle Efec/Transf.</p>
              </button>

              {/* Oferta */}
              <button onClick={() => generatePDF("oferta")} className="group border-2 border-border rounded-xl p-4 hover:border-red-500 transition-all text-left">
                <div className="border border-border rounded-lg p-3 mb-3 bg-accent/30">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="bg-red-500 text-white text-[5px] font-bold px-1.5 py-0.5 rounded">OFERTA</span>
                  </div>
                  <div className="text-center space-y-0.5">
                    <p className="text-[6px] font-bold leading-tight">Producto Ejemplo</p>
                    <p className="text-[7px] text-muted-foreground line-through">$1.500,00</p>
                    <p className="text-[12px] font-bold text-red-500">$1.200,00</p>
                  </div>
                </div>
                <p className="font-semibold text-sm group-hover:text-red-500">Oferta</p>
                <p className="text-xs text-muted-foreground mt-0.5">Precio tachado + precio oferta</p>
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
            </div>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold">Configuración del PDF</h2>
              <button onClick={() => setShowConfig(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex border-b border-border px-6 overflow-x-auto">
              {(["general", "cartel", "lista", "combinado", "oferta", "poster"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setConfigTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize whitespace-nowrap ${
                    configTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
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
                      {logoBase64 && <img src={logoBase64} alt="Logo" className="w-12 h-12 object-contain border border-border rounded-lg p-1" />}
                      <label className="cursor-pointer text-sm border border-border rounded-lg px-3 py-2 hover:bg-accent transition-colors">
                        {logoBase64 ? "Cambiar logo" : "Subir logo"}
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs text-muted-foreground mb-1">Tamaño del logo ({config.logoTamaño}mm)</label>
                      <input type="range" min={4} max={20} step={1} value={config.logoTamaño} onChange={(e) => updateConfig("logoTamaño", Number(e.target.value))} className="w-full accent-primary" />
                    </div>
                  </div>
                </>
              )}

              {configTab === "cartel" && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Grilla</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Columnas</label>
                        <input type="number" min={1} max={5} value={config.cartel_columnas} onChange={(e) => updateConfig("cartel_columnas", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Filas</label>
                        <input type="number" min={1} max={12} value={config.cartel_filas} onChange={(e) => updateConfig("cartel_filas", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{config.cartel_columnas * config.cartel_filas} carteles por página</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Tamaños de fuente</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Nombre (pt)</label>
                        <input type="number" min={6} max={20} value={config.cartel_tamañoNombre} onChange={(e) => updateConfig("cartel_tamañoNombre", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Precio (pt)</label>
                        <input type="number" min={10} max={48} value={config.cartel_tamañoPrecio} onChange={(e) => updateConfig("cartel_tamañoPrecio", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Transf. (pt)</label>
                        <input type="number" min={6} max={30} value={config.cartel_tamañoTransferencia} onChange={(e) => updateConfig("cartel_tamañoTransferencia", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Elementos visibles</h3>
                    <div className="space-y-3">
                      <ToggleSwitch checked={config.cartel_mostrarTransferencia} onChange={() => updateConfig("cartel_mostrarTransferencia", !config.cartel_mostrarTransferencia)} label="Precio transferencia" />
                      <ToggleSwitch checked={config.cartel_mostrarPrecioCaja} onChange={() => updateConfig("cartel_mostrarPrecioCaja", !config.cartel_mostrarPrecioCaja)} label="Unidades por caja" />
                      <ToggleSwitch checked={config.cartel_mostrarLogo} onChange={() => updateConfig("cartel_mostrarLogo", !config.cartel_mostrarLogo)} label="Logo" />
                      <ToggleSwitch checked={config.cartel_mostrarWeb} onChange={() => updateConfig("cartel_mostrarWeb", !config.cartel_mostrarWeb)} label="Página web" />
                      <ToggleSwitch checked={config.cartel_mostrarFecha} onChange={() => updateConfig("cartel_mostrarFecha", !config.cartel_mostrarFecha)} label="Fecha actual" />
                    </div>
                  </div>
                </>
              )}

              {configTab === "lista" && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Grilla</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Columnas</label>
                        <input type="number" min={1} max={5} value={config.lista_columnas} onChange={(e) => updateConfig("lista_columnas", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Filas</label>
                        <input type="number" min={1} max={12} value={config.lista_filas} onChange={(e) => updateConfig("lista_filas", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{config.lista_columnas * config.lista_filas} etiquetas por página</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Tamaños de fuente</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Nombre (pt)</label>
                        <input type="number" min={6} max={20} value={config.lista_tamañoNombre} onChange={(e) => updateConfig("lista_tamañoNombre", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">P. Grande (pt)</label>
                        <input type="number" min={6} max={30} value={config.lista_tamañoPrecioGrande} onChange={(e) => updateConfig("lista_tamañoPrecioGrande", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">P. Chico (pt)</label>
                        <input type="number" min={6} max={20} value={config.lista_tamañoPrecioChico} onChange={(e) => updateConfig("lista_tamañoPrecioChico", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Elementos visibles</h3>
                    <div className="space-y-3">
                      <ToggleSwitch checked={config.lista_mostrarCaja} onChange={() => updateConfig("lista_mostrarCaja", !config.lista_mostrarCaja)} label="Precio por caja" />
                      <ToggleSwitch checked={config.lista_mostrarFecha} onChange={() => updateConfig("lista_mostrarFecha", !config.lista_mostrarFecha)} label="Fecha actual" />
                    </div>
                  </div>
                </>
              )}

              {configTab === "combinado" && (
                <>
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
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Elementos visibles</h3>
                    <div className="space-y-3">
                      <ToggleSwitch checked={config.combinado_mostrarPrecioCaja} onChange={() => updateConfig("combinado_mostrarPrecioCaja", !config.combinado_mostrarPrecioCaja)} label="Precio por caja" />
                      <ToggleSwitch checked={config.combinado_mostrarLogo} onChange={() => updateConfig("combinado_mostrarLogo", !config.combinado_mostrarLogo)} label="Logo" />
                      <ToggleSwitch checked={config.combinado_mostrarWeb} onChange={() => updateConfig("combinado_mostrarWeb", !config.combinado_mostrarWeb)} label="Página web" />
                      <ToggleSwitch checked={config.combinado_mostrarFecha} onChange={() => updateConfig("combinado_mostrarFecha", !config.combinado_mostrarFecha)} label="Fecha actual" />
                    </div>
                  </div>
                </>
              )}

              {configTab === "oferta" && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Grilla</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Columnas</label>
                        <input type="number" min={1} max={5} value={config.oferta_columnas} onChange={(e) => updateConfig("oferta_columnas", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Filas</label>
                        <input type="number" min={1} max={12} value={config.oferta_filas} onChange={(e) => updateConfig("oferta_filas", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{config.oferta_columnas * config.oferta_filas} carteles por página</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Tamaños de fuente</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Nombre (pt)</label>
                        <input type="number" min={6} max={20} value={config.oferta_tamañoNombre} onChange={(e) => updateConfig("oferta_tamañoNombre", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">P. Oferta (pt)</label>
                        <input type="number" min={10} max={48} value={config.oferta_tamañoPrecioOferta} onChange={(e) => updateConfig("oferta_tamañoPrecioOferta", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">P. Original (pt)</label>
                        <input type="number" min={6} max={30} value={config.oferta_tamañoPrecioOriginal} onChange={(e) => updateConfig("oferta_tamañoPrecioOriginal", Number(e.target.value))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider">Elementos visibles</h3>
                    <div className="space-y-3">
                      <ToggleSwitch checked={config.oferta_mostrarPrecioCaja} onChange={() => updateConfig("oferta_mostrarPrecioCaja", !config.oferta_mostrarPrecioCaja)} label="Unidades por caja" />
                      <ToggleSwitch checked={config.oferta_mostrarLogo} onChange={() => updateConfig("oferta_mostrarLogo", !config.oferta_mostrarLogo)} label="Logo" />
                      <ToggleSwitch checked={config.oferta_mostrarWeb} onChange={() => updateConfig("oferta_mostrarWeb", !config.oferta_mostrarWeb)} label="Página web" />
                      <ToggleSwitch checked={config.oferta_mostrarFecha} onChange={() => updateConfig("oferta_mostrarFecha", !config.oferta_mostrarFecha)} label="Fecha actual" />
                    </div>
                  </div>
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
