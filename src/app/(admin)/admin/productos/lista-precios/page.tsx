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
  poster_tamañoNombre: number;
  poster_tamañoPrecio: number;
  poster_mostrarLogo: boolean;
  poster_mostrarWeb: boolean;
  poster_mostrarPrecioUnitario: boolean;
}

type PdfStyle = "combinado" | "poster";
type ConfigTab = "general" | PdfStyle;

const DEFAULT_FILTERS: Filters = { search: "", categoria: "", subcategoria: "", marca: "", enOferta: "", cajaEnOferta: "", precioPorCaja: "", hayStock: "", aumento: "" };

const DEFAULT_CONFIG: PdfConfig = {
  porcentajeTransferencia: 2,
  webUrl: "www.dulcesur.com",
  logoTamaño: 10,
  combinado_columnas: 3, combinado_filas: 7, combinado_tamañoNombre: 9, combinado_tamañoPrecio: 22,
  combinado_mostrarPrecioCaja: true, combinado_mostrarLogo: true, combinado_mostrarWeb: true, combinado_mostrarFecha: true,
  combinado_nombreOffset: 1, combinado_divisorY: 15, combinado_efectLabelY: 13.5, combinado_efectPrecioY: 11, combinado_transfLabelY: 9, combinado_transfPrecioY: 6.5, combinado_footerLineY: 4.5, combinado_footerTextY: 2, combinado_footerFontSize: 5,
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
      if (savedConfig) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(savedConfig) });
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
          const logoSize = config.combinado_mostrarLogo && logoBase64 ? Math.min(config.logoTamaño, cellH * 0.10) : 0;
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
          if (config.combinado_mostrarFecha) pdf.text(today, x + cellW - pad - 1, footerTextY, { align: "right" });
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
            pdf.text(`Caja x${product.unidadesCaja}`, x + cellW - pad, efectLabelY, { align: "right" });
          }
          pdf.setTextColor(0);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7);
          pdf.text(formatPrice(displayPrice), x + pad, efectPriceY);
          if (config.combinado_mostrarPrecioCaja && hasUnits && boxPrice > 0) {
            pdf.setFontSize(6.5);
            pdf.text(formatPrice(boxPrice), x + cellW - pad, efectPriceY, { align: "right" });
          }

          // TRANSF row
          const transfLabelY = bottom - config.combinado_transfLabelY;
          const transfPriceY = bottom - config.combinado_transfPrecioY;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5.5);
          pdf.setTextColor(140);
          pdf.text(`Transf. (${config.porcentajeTransferencia}%)`, x + pad, transfLabelY);
          if (config.combinado_mostrarPrecioCaja && hasUnits && boxPrice > 0) {
            pdf.text(`Caja x${product.unidadesCaja}`, x + cellW - pad, transfLabelY, { align: "right" });
          }
          pdf.setTextColor(0);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7);
          pdf.setTextColor(100);
          pdf.text(formatPrice(transferPrice), x + pad, transfPriceY);
          if (config.combinado_mostrarPrecioCaja && hasUnits && boxPrice > 0) {
            pdf.setFontSize(6.5);
            pdf.text(formatPrice(transferBox), x + cellW - pad, transfPriceY, { align: "right" });
          }
          pdf.setTextColor(0);

          // ── TOP ZONE (flows down from top) ──

          // Logo (top-left)
          if (config.combinado_mostrarLogo && logoBase64) {
            try { pdf.addImage(logoBase64, "PNG", x + pad, y + pad, logoSize, logoSize); } catch {}
          }

          // Marca (top-right corner)
          if (product.marca) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(5);
            pdf.setTextColor(130);
            pdf.text(product.marca.toUpperCase(), x + cellW - pad, y + pad + 3, { align: "right" });
            pdf.setTextColor(0);
          }

          // Product name — auto-shrink font if name is too long
          const topAreaEnd = y + pad + Math.max(logoSize, 4) + config.combinado_nombreOffset;
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
          pdf.text(formatPrice(displayPrice), x + cellW / 2, priceZoneCenter + config.combinado_tamañoPrecio * 0.15, { align: "center" });
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
            <div className="p-6 grid grid-cols-2 gap-4 max-w-2xl mx-auto">
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
          <div className={`bg-card rounded-2xl shadow-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-border ${configTab === "combinado" ? "max-w-4xl" : "max-w-lg"}`}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold">Configuración del PDF</h2>
              <button onClick={() => setShowConfig(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex border-b border-border px-6 overflow-x-auto">
              {(["general", "combinado", "poster"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setConfigTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    configTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "combinado" ? "Carteles de precios" : tab === "general" ? "General" : "Poster"}
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
                        <img src={logoBase64} alt="Logo" className="absolute object-contain" style={{ top: "8px", left: "8px", width: `${config.logoTamaño * 2.5}px`, height: `${config.logoTamaño * 2.5}px` }} />
                      )}
                      {config.combinado_mostrarLogo && !logoBase64 && (
                        <div className="absolute bg-gray-200 rounded" style={{ top: "8px", left: "8px", width: `${config.logoTamaño * 2.5}px`, height: `${config.logoTamaño * 2.5}px` }} />
                      )}
                      {/* Marca */}
                      <span className="absolute text-[8px] text-gray-400 uppercase" style={{ top: "12px", right: "8px" }}>MARCA</span>
                      {/* Nombre */}
                      <p className="absolute left-0 right-0 text-center font-bold text-black" style={{ top: `${Math.max(config.logoTamaño * 2.5, 16) + 8 + config.combinado_nombreOffset * 3}px`, fontSize: `${config.combinado_tamañoNombre}px`, padding: "0 8px" }}>
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
                  </div>
                </div>
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
