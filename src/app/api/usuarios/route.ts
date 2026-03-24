import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getAuthUser(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { nombre, email, password, rol_id, es_admin } = body;

    if (!nombre || !email || !password) {
      return NextResponse.json(
        { error: "Nombre, email y contraseña son requeridos" },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Email inválido" },
        { status: 400 }
      );
    }

    // Only admins can create admin accounts
    if (es_admin) {
      const { data: creator } = await supabaseAdmin
        .from("usuarios")
        .select("es_admin")
        .eq("auth_id", user.id)
        .single();
      if (!creator?.es_admin) {
        return NextResponse.json(
          { error: "Solo administradores pueden crear cuentas de admin" },
          { status: 403 }
        );
      }
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    // Create user in usuarios table
    const { data: usuario, error: dbError } = await supabaseAdmin
      .from("usuarios")
      .insert({
        nombre,
        email,
        auth_id: authData.user.id,
        rol_id: rol_id || null,
        es_admin: es_admin ?? false,
        activo: true,
      })
      .select()
      .single();

    if (dbError) {
      // Rollback: delete auth user if db insert fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: dbError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ usuario });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const auth_id = searchParams.get("auth_id");

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    // Deactivate in usuarios table
    const { error: dbError } = await supabaseAdmin
      .from("usuarios")
      .update({ activo: false })
      .eq("id", id);

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 400 });
    }

    // Optionally disable auth user
    if (auth_id) {
      await supabaseAdmin.auth.admin.updateUserById(auth_id, {
        ban_duration: "876600h", // ~100 years
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
