import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function requireAuth(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll() {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Verify user is admin
  const { data: usuario } = await supabaseAdmin
    .from("usuarios")
    .select("es_admin")
    .eq("auth_id", user.id)
    .single();
  if (!usuario?.es_admin) return null;
  return user;
}

const BACKUP_TABLES = [
  "productos",
  "categorias",
  "marcas",
  "subcategorias",
  "presentaciones",
  "clientes",
  "clientes_auth",
  "proveedores",
  "ventas",
  "venta_items",
  "compras",
  "compra_items",
  "caja_movimientos",
  "cuenta_corriente",
  "stock_movimientos",
  "zonas_entrega",
  "empresa",
  "numeradores",
  "roles",
  "permisos",
  "usuarios",
  "tienda_config",
  "descuentos",
];

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json({ error: "No autorizado. Solo administradores pueden exportar backups." }, { status: 401 });
    }

    const backupData: Record<string, unknown[]> = {};
    let totalRegistros = 0;

    for (const table of BACKUP_TABLES) {
      const { data, error } = await supabaseAdmin.from(table).select("*");

      if (error) {
        // Skip table on error
        backupData[table] = [];
        continue;
      }

      backupData[table] = data || [];
      totalRegistros += (data || []).length;
    }

    const metadata = {
      version: "1.0",
      created_at: new Date().toISOString(),
      tables: Object.keys(backupData),
    };

    const backup = {
      metadata,
      ...backupData,
    };

    // Log to backups table
    const dateStr = new Date().toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const { searchParams } = new URL(req.url);
    const createdBy = searchParams.get("created_by") || "Admin";

    await supabaseAdmin.from("backups").insert({
      nombre: `Backup ${dateStr}`,
      created_by: createdBy,
      tablas_incluidas: Object.keys(backupData),
      total_registros: totalRegistros,
    });

    const filename = `backup_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json({ error: "No autorizado. Solo administradores pueden restaurar backups." }, { status: 401 });
    }

    const body = await req.json();

    // Validate backup structure
    if (!body.version && !body.metadata) {
      return NextResponse.json(
        { error: "Formato de backup invalido: se requiere 'version' o 'metadata'" },
        { status: 400 }
      );
    }

    const metadata = body.metadata || { version: body.version };
    const results: Record<string, { status: string; deleted?: number; inserted?: number; error?: string }> = {};
    let successCount = 0;
    let failCount = 0;

    for (const table of BACKUP_TABLES) {
      if (!body[table]) {
        continue;
      }

      const tableData = body[table] as unknown[];

      try {
        // Delete existing records
        const { error: deleteError } = await supabaseAdmin
          .from(table)
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");

        if (deleteError) {
          results[table] = { status: "error", error: `Delete failed: ${deleteError.message}` };
          failCount++;
          continue;
        }

        // Insert backup data
        if (tableData.length > 0) {
          // Insert in batches of 500 to avoid payload limits
          const batchSize = 500;
          let insertedCount = 0;

          for (let i = 0; i < tableData.length; i += batchSize) {
            const batch = tableData.slice(i, i + batchSize);
            const { error: insertError } = await supabaseAdmin
              .from(table)
              .insert(batch);

            if (insertError) {
              results[table] = {
                status: "partial_error",
                inserted: insertedCount,
                error: `Insert failed at batch ${Math.floor(i / batchSize) + 1}: ${insertError.message}`,
              };
              failCount++;
              break; // Stop inserting this table to avoid further corruption
            }

            insertedCount += batch.length;
          }

          if (!results[table]) {
            results[table] = { status: "success", deleted: tableData.length, inserted: insertedCount };
            successCount++;
          }
        } else {
          results[table] = { status: "success", deleted: 0, inserted: 0 };
          successCount++;
        }
      } catch (tableErr: unknown) {
        const msg = tableErr instanceof Error ? tableErr.message : "Error desconocido";
        results[table] = { status: "error", error: msg };
        failCount++;
      }
    }

    // Log audit
    const userName = body._restored_by || "Admin";
    try {
      await supabaseAdmin.rpc("log_audit", {
        p_user_name: userName,
        p_action: "RESTORE",
        p_module: "backup",
        p_metadata: {
          metadata,
          success_count: successCount,
          fail_count: failCount,
          tables_restored: Object.keys(results),
        },
      });
    } catch {}


    return NextResponse.json({
      message: "Restauracion completada",
      success_count: successCount,
      fail_count: failCount,
      results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
