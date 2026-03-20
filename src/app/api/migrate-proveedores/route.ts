import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const secret = req.headers.get("x-pull-secret") || new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.PULL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const statements = [
    // Add new columns to producto_proveedores
    `ALTER TABLE producto_proveedores ADD COLUMN IF NOT EXISTS codigo_proveedor TEXT`,
    `ALTER TABLE producto_proveedores ADD COLUMN IF NOT EXISTS precio_proveedor NUMERIC DEFAULT NULL`,
    `ALTER TABLE producto_proveedores ADD COLUMN IF NOT EXISTS es_principal BOOLEAN DEFAULT false`,
    `ALTER TABLE producto_proveedores ADD COLUMN IF NOT EXISTS cantidad_minima_pedido INTEGER DEFAULT 1`,
    `ALTER TABLE producto_proveedores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()`,
    // Add stock_maximo to productos if missing
    `ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_maximo INTEGER DEFAULT 0`,
  ];

  const results: { sql: string; ok: boolean; error?: string }[] = [];

  for (const sql of statements) {
    const { error } = await admin.rpc("exec_sql", { query: sql });
    if (error) {
      // Try raw query via REST
      const { error: e2 } = await admin.from("producto_proveedores").select("id").limit(0);
      results.push({ sql, ok: !error, error: error?.message });
    } else {
      results.push({ sql, ok: true });
    }
  }

  return NextResponse.json({ message: "Migration completed", results });
}
