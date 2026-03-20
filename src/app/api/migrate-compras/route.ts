import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const secret =
    req.headers.get("x-pull-secret") ||
    new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.PULL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const statements = [
    // Add forma_pago and estado_pago to compras
    `ALTER TABLE compras ADD COLUMN IF NOT EXISTS forma_pago text`,
    `ALTER TABLE compras ADD COLUMN IF NOT EXISTS estado_pago text DEFAULT 'Pendiente'`,
    // Add cantidad_recibida to pedido_proveedor_items
    `ALTER TABLE pedido_proveedor_items ADD COLUMN IF NOT EXISTS cantidad_recibida integer DEFAULT 0`,
    // Create cuenta_corriente_proveedor table
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
    // RLS policy for the new table
    `ALTER TABLE cuenta_corriente_proveedor ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cuenta_corriente_proveedor' AND policyname = 'allow_all_authenticated') THEN
        CREATE POLICY allow_all_authenticated ON cuenta_corriente_proveedor FOR ALL USING (true);
      END IF;
    END $$`,
  ];

  const results: { sql: string; ok: boolean; error?: string }[] = [];

  for (const sql of statements) {
    const { error } = await admin.rpc("exec_sql", { query: sql });
    results.push({ sql: sql.slice(0, 80), ok: !error, error: error?.message });
  }

  return NextResponse.json({ message: "Migration completed", results });
}
