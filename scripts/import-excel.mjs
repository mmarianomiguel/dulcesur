import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

const sb = createClient(
  "https://oepqhdjuujfdlpjjktbs.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lcHFoZGp1dWpmZGxwamprdGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzYxMzkyMiwiZXhwIjoyMDg5MTg5OTIyfQ.NTlLOzIFzVjaCFVWz6cYgwbM2YWU7m_lHn0x0iEwOAw"
);

const FILE = "D:/N3yck/Descargas/Productos_Dulcesur_2026-03-24 (1).xlsx";

async function main() {
  // 1. Read Excel
  const wb = XLSX.readFile(FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  console.log(`📋 Excel: ${rows.length} productos`);

  // 2. Load existing DB data
  // Fetch all products (paginated to avoid 1000 row limit)
  let dbProducts = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from("productos").select("id, codigo, nombre, imagen_url, categoria_id, subcategoria_id, marca_id, stock, precio, costo, unidad_medida, activo, visibilidad, es_combo, stock_minimo, stock_maximo, precio_anterior").range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    dbProducts = dbProducts.concat(data);
    page++;
  }

  // Fetch all presentaciones (paginated)
  let dbPresentaciones = [];
  page = 0;
  while (true) {
    const { data } = await sb.from("presentaciones").select("*").range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    dbPresentaciones = dbPresentaciones.concat(data);
    page++;
  }
  const { data: dbCategorias } = await sb.from("categorias").select("id, nombre");
  const { data: dbSubcategorias } = await sb.from("subcategorias").select("id, nombre, categoria_id");
  const { data: dbMarcas } = await sb.from("marcas").select("id, nombre");

  console.log(`🗄️  DB: ${dbProducts.length} productos, ${dbPresentaciones.length} presentaciones`);
  console.log(`   ${dbCategorias.length} categorías, ${dbSubcategorias.length} subcategorías, ${dbMarcas.length} marcas`);

  // Index existing products by codigo
  const dbByCodigo = new Map();
  for (const p of dbProducts) {
    if (p.codigo) dbByCodigo.set(String(p.codigo), p);
  }

  // Index presentaciones by producto_id
  const presByProducto = new Map();
  for (const p of dbPresentaciones) {
    if (!presByProducto.has(p.producto_id)) presByProducto.set(p.producto_id, []);
    presByProducto.get(p.producto_id).push(p);
  }

  // 3. Build category/subcategory/marca lookup maps (create missing ones)
  const catMap = new Map(); // nombre -> id
  for (const c of dbCategorias) catMap.set(c.nombre, c.id);

  const subMap = new Map(); // "catId|nombre" -> id
  for (const s of dbSubcategorias) subMap.set(`${s.categoria_id}|${s.nombre}`, s.id);

  const marcaMap = new Map(); // nombre -> id
  for (const m of dbMarcas) marcaMap.set(m.nombre, m.id);

  // Helper: get or create category
  async function getCatId(nombre) {
    if (!nombre) return null;
    if (catMap.has(nombre)) return catMap.get(nombre);
    const { data, error } = await sb.from("categorias").insert({ nombre }).select("id").single();
    if (error) { console.error("❌ Error creating cat:", nombre, error.message); return null; }
    catMap.set(nombre, data.id);
    console.log(`  ➕ Categoría creada: ${nombre}`);
    return data.id;
  }

  // Helper: get or create subcategory
  async function getSubId(nombre, catId) {
    if (!nombre || !catId) return null;
    const key = `${catId}|${nombre}`;
    if (subMap.has(key)) return subMap.get(key);
    const { data, error } = await sb.from("subcategorias").insert({ nombre, categoria_id: catId }).select("id").single();
    if (error) { console.error("❌ Error creating sub:", nombre, error.message); return null; }
    subMap.set(key, data.id);
    console.log(`  ➕ Subcategoría creada: ${nombre}`);
    return data.id;
  }

  // Helper: get or create marca
  async function getMarcaId(nombre) {
    if (!nombre) return null;
    if (marcaMap.has(nombre)) return marcaMap.get(nombre);
    const { data, error } = await sb.from("marcas").insert({ nombre }).select("id").single();
    if (error) { console.error("❌ Error creating marca:", nombre, error.message); return null; }
    marcaMap.set(nombre, data.id);
    console.log(`  ➕ Marca creada: ${nombre}`);
    return data.id;
  }

  // 4. Process each Excel row
  const excelCodigos = new Set();
  let updated = 0, created = 0, presCreated = 0, presUpdated = 0, presDeleted = 0;

  for (const row of rows) {
    const codigo = String(row["Código de Barras"] || "").trim();
    if (!codigo) continue;
    excelCodigos.add(codigo);

    const nombre = String(row["Nombre del Articulo"] || "").trim();
    const catNombre = String(row["Categoría"] || "").trim();
    const subNombre = String(row["Subcategoria"] || "").trim();
    const marcaNombre = String(row["Marca"] || "").trim();
    const stock = Number(row["Stock"]) || 0;
    const costo = Number(row["Precio de Costo"]) || 0;
    const precio = Number(row["Precio de Venta"]) || 0;
    const unidadMedida = String(row["Unidad Medida"] || "Un").trim();
    const stockMin = Number(row["Stock Minimo"]) || 0;
    const stockMax = Number(row["Stock Maximo"]) || 0;

    // Presentacion data
    const presNombre = String(row["Presentacion Caja"] || "").trim();
    const presCantidad = Number(row["Cantidad Caja"]) || 0;
    const presSku = String(row["Codigo Caja"] || "").trim();
    const presCosto = Number(row["Costo Caja"]) || 0;
    const presPrecio = Number(row["Precio Caja"]) || 0;

    // Resolve foreign keys
    const catId = await getCatId(catNombre);
    const subId = await getSubId(subNombre, catId);
    const marcaId = await getMarcaId(marcaNombre);

    const existing = dbByCodigo.get(codigo);

    if (existing) {
      // UPDATE existing product - preserve imagen_url and proveedor_id
      const updates = {
        nombre,
        categoria_id: catId,
        subcategoria_id: subId,
        marca_id: marcaId,
        stock,
        costo,
        precio,
        unidad_medida: unidadMedida,
        stock_minimo: stockMin,
        stock_maximo: stockMax,
        activo: true,
        visibilidad: "visible",
        updated_at: new Date().toISOString(),
      };

      // Track price changes
      if (existing.precio !== precio) {
        updates.precio_anterior = existing.precio;
        updates.fecha_actualizacion = new Date().toISOString();
      }

      const { error } = await sb.from("productos").update(updates).eq("id", existing.id);
      if (error) { console.error(`❌ Error updating ${codigo}:`, error.message); continue; }
      updated++;

      // Handle presentaciones for existing product
      await syncPresentaciones(existing.id, codigo, presNombre, presCantidad, presSku, presCosto, presPrecio, unidadMedida, precio, costo);

    } else {
      // CREATE new product
      const newProd = {
        codigo,
        nombre,
        categoria_id: catId,
        subcategoria_id: subId,
        marca_id: marcaId,
        stock,
        costo,
        precio,
        unidad_medida: unidadMedida,
        stock_minimo: stockMin,
        stock_maximo: stockMax,
        activo: true,
        visibilidad: "visible",
      };

      const { data: inserted, error } = await sb.from("productos").insert(newProd).select("id").single();
      if (error) { console.error(`❌ Error creating ${codigo} ${nombre}:`, error.message); continue; }
      created++;

      // Create presentaciones for new product
      await syncPresentaciones(inserted.id, codigo, presNombre, presCantidad, presSku, presCosto, presPrecio, unidadMedida, precio, costo);
    }
  }

  // Helper: sync presentaciones for a product
  async function syncPresentaciones(productoId, codigo, presNombre, presCantidad, presSku, presCosto, presPrecio, unidadMedida, unitPrecio, unitCosto) {
    const existingPres = presByProducto.get(productoId) || [];

    // Build desired presentaciones
    const desired = [];

    // Always have "Unidad" presentacion
    desired.push({
      nombre: "Unidad",
      cantidad: 1,
      sku: codigo,
      costo: unitCosto,
      precio: unitPrecio,
      precio_oferta: null,
    });

    // Box/Display/Bulto/etc presentacion from Excel
    if (presNombre && presCantidad > 0) {
      desired.push({
        nombre: presNombre,
        cantidad: presCantidad,
        sku: presSku || `${codigo}-${presNombre.replace(/\s/g, "")}`,
        costo: presCosto || unitCosto * presCantidad,
        precio: presPrecio || unitPrecio * presCantidad,
        precio_oferta: null,
      });
    }

    // Medio Carton for cigarros (Mt unit)
    if (unidadMedida === "Mt") {
      desired.push({
        nombre: "Medio Carton",
        cantidad: 0.5,
        sku: `${codigo}-MT`,
        costo: Math.round(unitCosto * 0.5),
        precio: Math.round(unitPrecio * 0.5),
        precio_oferta: null,
      });
    }

    // Match existing presentaciones by nombre
    const existingByNombre = new Map();
    for (const ep of existingPres) {
      existingByNombre.set(ep.nombre, ep);
    }

    // Update or create desired presentaciones
    for (const d of desired) {
      const existing = existingByNombre.get(d.nombre);
      if (existing) {
        // Update if changed
        const changed = existing.cantidad !== d.cantidad || existing.precio !== d.precio || existing.costo !== d.costo || existing.sku !== d.sku;
        if (changed) {
          await sb.from("presentaciones").update({
            cantidad: d.cantidad,
            sku: d.sku,
            costo: d.costo,
            precio: d.precio,
          }).eq("id", existing.id);
          presUpdated++;
        }
        existingByNombre.delete(d.nombre);
      } else {
        // Create new
        await sb.from("presentaciones").insert({
          producto_id: productoId,
          ...d,
        });
        presCreated++;
      }
    }

    // Delete presentaciones that are no longer in Excel
    for (const [, leftover] of existingByNombre) {
      await sb.from("presentaciones").delete().eq("id", leftover.id);
      presDeleted++;
    }
  }

  // 5. Delete products NOT in Excel
  const toDelete = dbProducts.filter(p => p.codigo && !excelCodigos.has(String(p.codigo)));
  console.log(`\n🗑️  Productos a eliminar: ${toDelete.length}`);

  if (toDelete.length > 0) {
    // First delete their presentaciones
    const deleteIds = toDelete.map(p => p.id);
    for (let i = 0; i < deleteIds.length; i += 50) {
      const batch = deleteIds.slice(i, i + 50);
      await sb.from("presentaciones").delete().in("producto_id", batch);
    }

    // Then delete products
    for (let i = 0; i < deleteIds.length; i += 50) {
      const batch = deleteIds.slice(i, i + 50);
      const { error } = await sb.from("productos").delete().in("id", batch);
      if (error) console.error("❌ Error deleting batch:", error.message);
    }
    console.log(`   ✅ Eliminados ${toDelete.length} productos y sus presentaciones`);
  }

  // Summary
  console.log(`\n✅ IMPORTACIÓN COMPLETA:`);
  console.log(`   Productos actualizados: ${updated}`);
  console.log(`   Productos creados: ${created}`);
  console.log(`   Productos eliminados: ${toDelete.length}`);
  console.log(`   Presentaciones creadas: ${presCreated}`);
  console.log(`   Presentaciones actualizadas: ${presUpdated}`);
  console.log(`   Presentaciones eliminadas: ${presDeleted}`);

  // Verify
  const { count: finalCount } = await sb.from("productos").select("*", { count: "exact", head: true });
  const { count: finalPres } = await sb.from("presentaciones").select("*", { count: "exact", head: true });
  const { count: finalImg } = await sb.from("productos").select("*", { count: "exact", head: true }).not("imagen_url", "is", null);
  console.log(`\n📊 DB Final: ${finalCount} productos, ${finalPres} presentaciones, ${finalImg} con imagen`);
}

main().catch(console.error);
