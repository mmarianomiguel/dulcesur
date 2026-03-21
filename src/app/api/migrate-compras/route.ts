import { NextResponse } from "next/server";
// @ts-ignore
import { Client } from "pg";

export async function POST(req: Request) {
  const secret =
    req.headers.get("x-pull-secret") ||
    new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.PULL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use the Supabase DB password to connect directly
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  // Extract project ref from URL (e.g., https://abc123.supabase.co -> abc123)
  const projectRef = supabaseUrl.replace("https://", "").split(".")[0];

  const client = new Client({
    host: `aws-0-sa-east-1.pooler.supabase.com`,
    port: 5432,
    database: "postgres",
    user: `postgres.${projectRef}`,
    password: dbPassword,
    ssl: { rejectUnauthorized: false },
  });

  const results: { sql: string; ok: boolean; error?: string }[] = [];

  try {
    await client.connect();

    const statements = [
      `ALTER TABLE compras ADD COLUMN IF NOT EXISTS forma_pago text`,
      `ALTER TABLE compras ADD COLUMN IF NOT EXISTS estado_pago text DEFAULT 'Pendiente'`,
      `ALTER TABLE pedido_proveedor_items ADD COLUMN IF NOT EXISTS cantidad_recibida integer DEFAULT 0`,
      `CREATE TABLE IF NOT EXISTS cuenta_corriente_proveedor (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        proveedor_id uuid NOT NULL REFERENCES proveedores(id),
        fecha date NOT NULL DEFAULT CURRENT_DATE,
        tipo text NOT NULL,
        descripcion text NOT NULL,
        monto numeric NOT NULL,
        saldo_resultante numeric NOT NULL DEFAULT 0,
        referencia_id uuid,
        referencia_tipo text,
        created_at timestamptz DEFAULT now()
      )`,
      `ALTER TABLE cuenta_corriente_proveedor ENABLE ROW LEVEL SECURITY`,
    ];

    for (const sql of statements) {
      try {
        await client.query(sql);
        results.push({ sql: sql.slice(0, 80), ok: true });
      } catch (err: any) {
        results.push({ sql: sql.slice(0, 80), ok: false, error: err.message });
      }
    }

    // Create RLS policy
    try {
      await client.query(
        `CREATE POLICY allow_all_authenticated ON cuenta_corriente_proveedor FOR ALL USING (true)`
      );
      results.push({ sql: "CREATE POLICY allow_all_authenticated", ok: true });
    } catch (err: any) {
      results.push({
        sql: "CREATE POLICY allow_all_authenticated",
        ok: false,
        error: err.message,
      });
    }

    await client.end();
  } catch (err: any) {
    return NextResponse.json(
      { error: "DB connection failed: " + err.message, results },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "Migration completed", results });
}
