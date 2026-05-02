/**
 * Re-pad de imágenes ya migradas a Supabase Storage.
 *
 * Las imágenes en Supabase tienen aspect ratios variados (muchas portrait
 * 400x900) y se ven chicas en las cards 4:3 con object-contain. Este script
 * baja cada imagen, la encaja dentro de un canvas cuadrado 1200x1200 con
 * fondo blanco (sharp .resize fit: contain), la re-sube al mismo path y
 * bumpea el cache-bust en imagen_url.
 *
 * Uso:
 *   node scripts/repad-supabase-images.mjs --limit 1 --dry-run   # solo loggea
 *   node scripts/repad-supabase-images.mjs --limit 1             # 1 imagen real
 *   node scripts/repad-supabase-images.mjs                       # todas
 *
 * Cada corrida real guarda scripts/repad-rollback-{timestamp}.json con
 * { producto_id, old_url, new_url } por si hay que revertir el bump de URL.
 *
 * Variables de entorno requeridas (.env):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync } from "fs";
import sharp from "sharp";

config({ path: resolve(process.cwd(), ".env") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const argv = process.argv.slice(2);
const limitArg = argv.indexOf("--limit");
const LIMIT = limitArg !== -1 ? parseInt(argv[limitArg + 1], 10) : Infinity;
const DRY_RUN = argv.includes("--dry-run");

const BUCKET = "productos";
const SIZE = 1200;

function publicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} bajando ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function pathFromSupabaseUrl(url) {
  // .../storage/v1/object/public/productos/<file>?v=...
  const m = url.match(/\/storage\/v1\/object\/public\/productos\/([^?]+)/);
  return m ? m[1] : null;
}

async function main() {
  console.log(`Modo: ${DRY_RUN ? "DRY-RUN" : "REAL"} | límite: ${LIMIT === Infinity ? "todos" : LIMIT}`);

  const { data: productos, error } = await supabase
    .from("productos")
    .select("id, nombre, imagen_url")
    .ilike("imagen_url", "%.supabase.co/storage/v1/object/public/productos/%")
    .order("id", { ascending: true })
    .range(0, LIMIT === Infinity ? 4999 : LIMIT - 1);

  if (error) {
    console.error("❌ Error consultando productos:", error.message);
    process.exit(1);
  }

  console.log(`📦 ${productos.length} productos a procesar`);

  const rollback = [];
  let ok = 0;
  let fail = 0;
  let skipped = 0;

  for (const p of productos) {
    const oldUrl = p.imagen_url;
    const path = pathFromSupabaseUrl(oldUrl);
    if (!path) {
      console.error(`  ✗ ${p.id} ${p.nombre?.slice(0, 40)}: no pude extraer path de ${oldUrl}`);
      fail++;
      continue;
    }
    try {
      const original = await fetchBuffer(oldUrl);
      const meta = await sharp(original).metadata();

      // Skip si ya es cuadrada (idempotente para re-runs)
      if (meta.width === SIZE && meta.height === SIZE) {
        console.log(`  − ${p.id} ${p.nombre?.slice(0, 40)} ya es ${SIZE}x${SIZE}, skip`);
        skipped++;
        continue;
      }

      const padded = await sharp(original)
        .resize(SIZE, SIZE, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .webp({ quality: 85 })
        .toBuffer();

      if (DRY_RUN) {
        console.log(
          `  [dry] ${p.id} ${p.nombre?.slice(0, 40)} ${meta.width}x${meta.height} → ${SIZE}x${SIZE} (${(padded.length / 1024).toFixed(1)} KB)`
        );
        ok++;
        continue;
      }

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, padded, {
          contentType: "image/webp",
          upsert: true,
          cacheControl: "31536000",
        });
      if (upErr) throw new Error(`upload: ${upErr.message}`);

      const v = Date.now();
      const newUrl = `${publicUrl(path)}?v=${v}`;

      const { error: updErr } = await supabase
        .from("productos")
        .update({ imagen_url: newUrl })
        .eq("id", p.id);
      if (updErr) throw new Error(`update: ${updErr.message}`);

      rollback.push({ producto_id: p.id, old_url: oldUrl, new_url: newUrl });
      ok++;
      console.log(`  ✓ ${p.id} ${p.nombre?.slice(0, 40)} ${meta.width}x${meta.height} → ${SIZE}x${SIZE}`);
    } catch (e) {
      fail++;
      console.error(`  ✗ ${p.id} ${p.nombre?.slice(0, 40)}: ${e.message}`);
    }
  }

  if (!DRY_RUN && rollback.length > 0) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = resolve(process.cwd(), `scripts/repad-rollback-${stamp}.json`);
    writeFileSync(file, JSON.stringify(rollback, null, 2));
    console.log(`\n📝 Rollback guardado en: ${file}`);
  }

  console.log(`\n✅ OK: ${ok}   ⊘ Skipped: ${skipped}   ❌ Fail: ${fail}   Total: ${productos.length}`);
}

main().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});
