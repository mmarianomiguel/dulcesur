import { supabase } from "@/lib/supabase";

export async function logAudit(opts: {
  userName: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "ANULACION" | "BACKUP" | "RESTORE" | "EXPORT" | "IMPORT";
  module: "ventas" | "productos" | "clientes" | "stock" | "compras" | "caja" | "auth" | "config" | "backup";
  entityId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabase.rpc("log_audit", {
      p_user_name: opts.userName,
      p_action: opts.action,
      p_module: opts.module,
      p_entity_id: opts.entityId || null,
      p_before: opts.before || null,
      p_after: opts.after || null,
      p_metadata: opts.metadata || null,
    });
  } catch {
    // Audit logging should never break the main operation
    console.error("Audit log failed");
  }
}
