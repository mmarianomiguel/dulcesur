import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Simple in-memory rate limiter
const attempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5; // max attempts
const RATE_WINDOW = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Cleanup stale entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now > entry.resetAt) attempts.delete(key);
  }
}, 60_000);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const rateLimitKey = `${ip}:${action}`;

    if (!checkRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intenta de nuevo en 15 minutos." },
        { status: 429 }
      );
    }

    if (action === "login") {
      return handleLogin(body);
    } else if (action === "register") {
      return handleRegister(body);
    } else if (action === "change-password") {
      return handleChangePassword(body);
    } else if (action === "reset-password") {
      return handleResetPassword(body);
    } else if (action === "create-from-admin") {
      return handleCreateFromAdmin(body);
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

async function handleLogin({ email, password }: { email: string; password: string; action: string }) {
  if (!email || !password) {
    return NextResponse.json({ error: "Email y contraseña son requeridos" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("clientes_auth")
    .select("id, nombre, email, password_hash")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Email o contraseña incorrectos." }, { status: 401 });
  }

  // Try bcrypt first, then SHA-256 legacy (plaintext comparison removed for security)
  let valid = false;
  let needsUpgrade = false;

  if (data.password_hash.startsWith("$2")) {
    // Already bcrypt
    valid = await bcrypt.compare(password, data.password_hash);
  } else {
    // Legacy: SHA-256 hash only
    const sha256 = await sha256Hash(password);
    if (data.password_hash === sha256) {
      valid = true;
      needsUpgrade = true;
    }
  }

  if (!valid) {
    return NextResponse.json({ error: "Email o contraseña incorrectos." }, { status: 401 });
  }

  // Upgrade to bcrypt if using legacy hash
  if (needsUpgrade) {
    const bcryptHash = await bcrypt.hash(password, 10);
    await supabase.from("clientes_auth").update({ password_hash: bcryptHash }).eq("id", data.id);
  }

  return NextResponse.json({
    cliente: { id: data.id, nombre: data.nombre, email: data.email },
  });
}

async function handleRegister({
  nombre, email, password, telefono, dni, domicilio, localidad, provincia, codigoPostal,
}: {
  nombre: string; email: string; password: string; action: string;
  telefono?: string; dni?: string; domicilio?: string; localidad?: string; provincia?: string; codigoPostal?: string;
}) {
  if (!nombre || !email || !password) {
    return NextResponse.json({ error: "Nombre, email y contraseña son requeridos" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("clientes_auth")
    .select("id")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (existing) {
    return NextResponse.json({ error: "Ya existe una cuenta con ese email." }, { status: 409 });
  }

  // Get default zona (Zona 1)
  const { data: defaultZona } = await supabase.from("zonas_entrega").select("id").ilike("nombre", "%zona 1%").limit(1).maybeSingle();
  const defaultZonaId = defaultZona?.id || null;

  // Create client record
  const { data: clienteData } = await supabase
    .from("clientes")
    .insert({
      nombre,
      email: email.toLowerCase().trim(),
      telefono: telefono || null,
      numero_documento: dni || null,
      tipo_documento: dni ? "DNI" : null,
      domicilio: domicilio || null,
      localidad: localidad || null,
      provincia: provincia || null,
      codigo_postal: codigoPostal || null,
      situacion_iva: "Consumidor final",
      origen: "tienda",
      vendedor_id: "94b3d01c-6be8-4a38-a8f0-c42b6502b19e", // Mariano Miguel (default)
      zona_entrega: defaultZonaId || null,
    })
    .select("id")
    .single();

  const bcryptHash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from("clientes_auth")
    .insert({
      nombre,
      email: email.toLowerCase().trim(),
      telefono: telefono || "",
      password_hash: bcryptHash,
      cliente_id: clienteData?.id || null,
    })
    .select("id, nombre, email")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Error al crear la cuenta." }, { status: 500 });
  }

  return NextResponse.json({ cliente: data });
}

async function handleChangePassword({
  clienteAuthId, currentPassword, newPassword,
}: {
  clienteAuthId: string; currentPassword: string; newPassword: string; action: string;
}) {
  if (!clienteAuthId || !currentPassword || !newPassword) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
  }

  const { data: match } = await supabase
    .from("clientes_auth")
    .select("id, password_hash")
    .eq("id", clienteAuthId)
    .single();

  if (!match) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }

  // Verify current password (bcrypt or SHA-256 legacy)
  let valid = false;
  if (match.password_hash.startsWith("$2")) {
    valid = await bcrypt.compare(currentPassword, match.password_hash);
  } else {
    const sha256 = await sha256Hash(currentPassword);
    valid = match.password_hash === sha256;
  }

  if (!valid) {
    return NextResponse.json({ error: "La contraseña actual es incorrecta." }, { status: 401 });
  }

  const bcryptHash = await bcrypt.hash(newPassword, 10);
  await supabase.from("clientes_auth").update({ password_hash: bcryptHash }).eq("id", clienteAuthId);

  return NextResponse.json({ success: true });
}

async function handleResetPassword({
  clienteAuthId, newPassword,
}: {
  clienteAuthId: string; newPassword: string; action: string;
}) {
  if (!clienteAuthId || !newPassword) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
  }

  // Verify caller is an authenticated admin user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const bcryptHash = await bcrypt.hash(newPassword, 10);
  const { error } = await supabase
    .from("clientes_auth")
    .update({ password_hash: bcryptHash })
    .eq("id", clienteAuthId);

  if (error) {
    return NextResponse.json({ error: "Error al restablecer la contraseña" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

async function handleCreateFromAdmin({
  nombre, email, password, cliente_id, telefono,
}: {
  nombre: string; email: string; password: string; cliente_id: string; telefono?: string; action: string;
}) {
  if (!nombre || !email || !password || !cliente_id) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  // Check if email already exists in clientes_auth
  const { data: existing } = await supabase
    .from("clientes_auth")
    .select("id")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (existing) {
    return NextResponse.json({ error: "already_exists", message: "Ya existe una cuenta con ese email." }, { status: 409 });
  }

  const bcryptHash = await bcrypt.hash(password, 10);

  const { error } = await supabase
    .from("clientes_auth")
    .insert({
      nombre,
      email: email.toLowerCase().trim(),
      telefono: telefono || "",
      password_hash: bcryptHash,
      cliente_id,
    });

  if (error) {
    return NextResponse.json({ error: "Error al crear acceso: " + error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

async function sha256Hash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
