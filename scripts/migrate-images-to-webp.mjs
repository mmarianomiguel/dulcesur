/**
 * Migración: convierte imágenes PNG/JPG de Cloudinary a WebP
 *
 * Uso:
 *   node scripts/migrate-images-to-webp.mjs           # migra todo
 *   node scripts/migrate-images-to-webp.mjs --limit 5 # prueba con 5
 *
 * Variables de entorno requeridas (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 */

import { v2 as cloudinary } from "cloudinary";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Lee --limit N de los argumentos
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

/**
 * Extrae el public_id de una URL de Cloudinary.
 * Maneja URLs con y sin versión.
 * Ej: .../upload/v1234/dulcesur/foto.png  → "dulcesur/foto"
 *     .../upload/dulcesur/foto.jpg         → "dulcesur/foto"
 */
function extractPublicId(url) {
  const idx = url.indexOf("/upload/");
  if (idx === -1) return null;
  let path = url.slice(idx + 8); // todo lo que viene después de /upload/
  path = path.replace(/^v\d+\//, ""); // quita versión "v123456/"
  path = path.replace(/\.[a-zA-Z0-9]+$/, ""); // quita extensión
  return path || null;
}

/** Devuelve true si la imagen necesita migración a WebP */
function needsMigration(url) {
  if (!url || !url.includes("res.cloudinary.com")) return false;
  // Ya fue migrada si termina en .webp o contiene transformaciones en la URL
  if (url.endsWith(".webp") || url.includes("/upload/w_")) return false;
  return true;
}

async function migrateImage(producto) {
  const { id, nombre, imagen_url } = producto;
  const originalPublicId = extractPublicId(imagen_url);

  if (!originalPublicId) {
    return { ok: false, reason: `No se pudo extraer public_id de: ${imagen_url}` };
  }

  // Nuevo public_id: mismo path pero con sufijo _webp para no pisar el original
  // hasta confirmar que todo salió bien
  const newPublicId = originalPublicId + "_webp";

  // 1. Re-sube desde la URL existente de Cloudinary, forzando WebP
  const result = await cloudinary.uploader.upload(imagen_url, {
    public_id: newPublicId,
    overwrite: true,
    resource_type: "image",
    format: "webp",
    transformation: [{ width: 1200, crop: "limit", quality: "auto:good" }],
  });

  const newUrl = result.secure_url;

  // 2. Actualiza Supabase con la nueva URL
  const { error } = await supabase
    .from("productos")
    .update({ imagen_url: newUrl })
    .eq("id", id);

  if (error) {
    // Rollback: borra el WebP recién creado si no se pudo guardar en Supabase
    await cloudinary.uploader.destroy(newPublicId).catch(() => {});
    return { ok: false, reason: `Supabase error: ${error.message}` };
  }

  // 3. Borra el original (PNG/JPG) de Cloudinary
  await cloudinary.uploader.destroy(originalPublicId, { resource_type: "image" });

  return {
    ok: true,
    nombre,
    urlAntes: imagen_url,
    urlDespues: newUrl,
    originalPublicId,
    newPublicId,
  };
}

async function main() {
  console.log("=".repeat(70));
  console.log("  MIGRACIÓN DE IMÁGENES A WEBP");
  if (LIMIT !== Infinity) console.log(`  Modo prueba: procesando máximo ${LIMIT} imágenes`);
  console.log("=".repeat(70) + "\n");

  const { data: productos, error } = await supabase
    .from("productos")
    .select("id, nombre, imagen_url")
    .not("imagen_url", "is", null);

  if (error) {
    console.error("Error al leer Supabase:", error.message);
    process.exit(1);
  }

  const pendientes = productos
    .filter((p) => needsMigration(p.imagen_url))
    .slice(0, LIMIT);

  console.log(`Productos con imagen en Cloudinary: ${productos.filter(p => p.imagen_url?.includes("res.cloudinary.com")).length}`);
  console.log(`A migrar (no-WebP): ${productos.filter(p => needsMigration(p.imagen_url)).length}`);
  if (LIMIT !== Infinity) console.log(`Procesando en esta ejecución: ${pendientes.length}`);
  console.log();

  if (pendientes.length === 0) {
    console.log("Nada que migrar. Todas las imágenes ya son WebP.");
    return;
  }

  const resultados = [];

  for (let i = 0; i < pendientes.length; i++) {
    const p = pendientes[i];
    const prefix = `[${i + 1}/${pendientes.length}]`;
    process.stdout.write(`${prefix} ${p.nombre.slice(0, 45).padEnd(45)} ... `);

    try {
      const res = await migrateImage(p);
      if (res.ok) {
        console.log("OK");
        resultados.push(res);
      } else {
        console.log(`ERROR: ${res.reason}`);
        resultados.push({ ok: false, nombre: p.nombre, reason: res.reason });
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      resultados.push({ ok: false, nombre: p.nombre, reason: err.message });
    }

    // Pausa breve para no saturar la API de Cloudinary
    await new Promise((r) => setTimeout(r, 400));
  }

  // --- Reporte final ---
  const ok = resultados.filter((r) => r.ok);
  const fail = resultados.filter((r) => !r.ok);

  console.log("\n" + "=".repeat(70));
  console.log(`  RESULTADO: ${ok.length} migrados OK, ${fail.length} errores`);
  console.log("=".repeat(70));

  if (ok.length > 0) {
    console.log("\nProductos migrados:");
    for (const r of ok) {
      console.log(`\n  Producto : ${r.nombre}`);
      console.log(`  Antes    : ${r.urlAntes}`);
      console.log(`  Después  : ${r.urlDespues}`);
    }
  }

  if (fail.length > 0) {
    console.log("\nErrores:");
    for (const r of fail) {
      console.log(`  ${r.nombre}: ${r.reason}`);
    }
  }

  console.log();
}

main();
