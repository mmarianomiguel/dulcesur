/**
 * Migración: imágenes Cloudinary → Supabase Storage (bucket "productos")
 *
 * Uso:
 *   node scripts/migrate-images-to-supabase.mjs --limit 10 --dry-run   # solo loggea
 *   node scripts/migrate-images-to-supabase.mjs --limit 10             # migra 10
 *   node scripts/migrate-images-to-supabase.mjs                        # migra todo lo pendiente
 *
 * Cada corrida guarda un rollback JSON en scripts/migration-rollback-{timestamp}.json
 * con { producto_id, old_url, new_url } por si hay que revertir.
 *
 * Variables de entorno requeridas (.env):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync, readFileSync } from "fs";

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
const idsFileArg = argv.indexOf("--ids-file");
const IDS_FILE = idsFileArg !== -1 ? argv[idsFileArg + 1] : null;

const BUCKET = "productos";

function publicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} bajando ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function main() {
  console.log(`Modo: ${DRY_RUN ? "DRY-RUN (no escribe)" : "REAL"} | límite: ${LIMIT === Infinity ? "todos" : LIMIT}`);

  let query = supabase
    .from("productos")
    .select("id, nombre, imagen_url, fecha_actualizacion")
    .ilike("imagen_url", "%cloudinary%");

  if (IDS_FILE) {
    const ids = readFileSync(resolve(process.cwd(), IDS_FILE), "utf8")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    console.log(`📂 Leyendo ${ids.length} IDs desde ${IDS_FILE}`);
    query = query.in("id", ids);
  } else {
    query = query.order("id", { ascending: true }).range(0, LIMIT === Infinity ? 4999 : LIMIT - 1);
  }

  const { data: productos, error } = await query;

  if (error) {
    console.error("❌ Error consultando productos:", error.message);
    process.exit(1);
  }

  console.log(`📦 ${productos.length} productos a procesar`);

  const rollback = [];
  let ok = 0;
  let fail = 0;

  for (const p of productos) {
    const oldUrl = p.imagen_url;
    const path = `${p.id}.webp`;
    try {
      const buffer = await fetchBuffer(oldUrl);

      if (DRY_RUN) {
        console.log(`  [dry] ${p.id} ${p.nombre?.slice(0, 40)} → ${path} (${(buffer.length / 1024).toFixed(1)} KB)`);
        ok++;
        continue;
      }

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType: "image/webp",
          upsert: true,
          cacheControl: "31536000",
        });
      if (upErr) throw new Error(`upload: ${upErr.message}`);

      // Cache-bust con la fecha de actualización del producto.
      const v = p.fecha_actualizacion ? new Date(p.fecha_actualizacion).getTime() : Date.now();
      const newUrl = `${publicUrl(path)}?v=${v}`;

      const { error: updErr } = await supabase
        .from("productos")
        .update({ imagen_url: newUrl })
        .eq("id", p.id);
      if (updErr) throw new Error(`update: ${updErr.message}`);

      rollback.push({ producto_id: p.id, old_url: oldUrl, new_url: newUrl });
      ok++;
      console.log(`  ✓ ${p.id} ${p.nombre?.slice(0, 40)}`);
    } catch (e) {
      fail++;
      console.error(`  ✗ ${p.id} ${p.nombre?.slice(0, 40)}: ${e.message}`);
    }
  }

  if (!DRY_RUN && rollback.length > 0) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = resolve(process.cwd(), `scripts/migration-rollback-${stamp}.json`);
    writeFileSync(file, JSON.stringify(rollback, null, 2));
    console.log(`\n📝 Rollback guardado en: ${file}`);
  }

  console.log(`\n✅ OK: ${ok}   ❌ Fail: ${fail}   Total: ${productos.length}`);
}

main().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});
